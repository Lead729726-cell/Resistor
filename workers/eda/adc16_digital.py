"""Independent ADC16 integer references and native RTL/gate/CMOS-IR replay."""
import copy, hashlib, json, math, shutil
from pathlib import Path
import adc16 as A, sigma_delta as SD, runtime_resources
from geometry import EDAError


def quantize16(value,reference=1.2):
    if not math.isfinite(value)or not math.isfinite(reference)or reference<=0:raise EDAError('ADC16_INPUT','Finite input and positive reference required.')
    return min(65535,max(0,math.floor((value/reference+1)*32768)))


def cic3_reference(bits,resets):
    if len(bits)!=len(resets)or any(x not in(0,1)for x in bits+resets):raise EDAError('ADC16_DIGITAL_INPUT','CIC requires binary samples/reset with equal lengths.')
    # Direct FIR convolution by (1+z^-1+...+z^-255)^3, independent of
    # the RTL's modulo-integrator/comb implementation and state recurrence.
    weights=[]
    for k in range(766):
        def choose2(n):return(n+2)*(n+1)//2 if n>=0 else 0
        weights.append(choose2(k)-3*choose2(k-256)+3*choose2(k-512))
    history=[];phase=0;frames=0;code=0;rows=[]
    for bit,reset in zip(bits,resets):
        if reset:history=[];phase=0;frames=0;code=0;rows.append((code,0));continue
        history.append(bit);valid=0
        if phase==255:
            frames+=1
            if frames>=3:
                total=sum(w*v for w,v in zip(weights,reversed(history[-766:])))
                if not 0<=total<=1<<24:raise EDAError('ADC16_FILTER_RANGE','Independent unsigned FIR bound exceeded.')
                code=min(65535,total>>8);valid=1
        phase=(phase+1)%256;rows.append((code,valid))
    return rows


def pipeline_digits(value):
    if not math.isfinite(value)or not -1<=value<=1:raise EDAError('ADC16_INPUT','Normalized pipeline input must be within ±1.')
    residue=value;digits=[]
    for _ in range(14):
        digit=-1 if residue<-.25 else 1 if residue>=.25 else 0
        digits.append({-1:0,0:1,1:3}[digit]);residue=2*residue-digit
    tail=min(3,max(0,math.floor(2*(residue+1))));flash=(0,1,3,7)[tail]
    return digits,flash,residue


def decode_pipeline(digits,flash):
    if len(digits)!=14 or any(v not in(0,1,3)for v in digits)or flash not in(0,1,3,7):raise EDAError('ADC16_THERMOMETER','Malformed thermometer code, never silently repaired.')
    value=32766+(0,1,3,7).index(flash)+sum({0:-1,1:0,3:1}[v]*(1<<(14-i))for i,v in enumerate(digits))
    return min(65535,max(0,value))


def logic_ir(stem,top,header,outputs):
    ir=A.digital(stem);ir=SD.used(ir,ir['cells']);leaves={'INV':'assign Y=~A;','NAND2':'assign Y=~(A0&A1);','NOR2':'assign Y=~(A|B);','AND2':'assign Y=A&B;','OR2':'assign Y=A|B;','XOR2':'assign Y=A^B;','MUX2':'assign Y=S?B:A;','DFF':'always @(posedge CLK) Q<=D;'}
    lines=[]
    for name,cell in {**ir['cells'],'IR_ROOT':{k:v for k,v in ir.items()if k!='cells'}}.items():
        out=outputs if name=='IR_ROOT'else['Q']if name=='DFF'else['Y'];inputs=[p for p in cell['ports']if p not in out]
        lines+=['module '+name+'('+','.join(cell['ports'])+');','input '+','.join(inputs)+';',('output reg 'if name=='DFF'else'output ')+','.join(out)+';']
        if name in leaves:lines.append(leaves[name])
        else:
            nets=sorted({n for d in cell['devices']for n in d['pins'].values()}-set(cell['ports']))
            if nets:lines.append('wire '+','.join(nets)+';')
            for d in cell['devices']:
                if d['kind']!='block':raise EDAError('ADC16_IR','Unknown edited CMOS leaf needs a new logic adapter.')
                lines.append(d['cell_name']+' '+d['name']+'('+','.join('.'+p+'('+n+')'for p,n in d['pins'].items())+');')
        lines.append('endmodule')
    # Explicit scalar bindings preserve every bus bit and actual named port.
    interface={
     'sar16':[('clk',1),('reset',1),('start',1),('comparator',1),('sample',1),('eval',1),('busy',1),('valid',1),('trial',16),('code',16)],
     'sigma_delta16':[('clk',1),('reset',1),('bit_in',1),('code',16),('valid',1)],
     'pipeline16':[('clk',1),('reset',1),('sample_valid',1),('stage_codes',28),('flash_therm',3),('code',16),('valid',1),('error',1)]}[stem]
    bindings=[f'.{name.upper()+(str(i)if width>1 else"")}({name+"["+str(i)+"]"if width>1 else name})'for name,width in interface for i in range(width)]
    lines+=[f'module {top}({header});','IR_ROOT u('+','.join(bindings)+",.VPWR(1'b1),.VGND(1'b0));",'endmodule']
    return '\n'.join(lines)+'\n'


def replay(server,run,folder,manifest,stem,top,tb):
    folder=Path(folder);test=folder/'replay.v';test.write_text(tb)
    manifest.setdefault('settings',{}).setdefault('adc16_digital_sources',{})[stem]={f.name:hashlib.sha256(f.read_bytes()).hexdigest()for f in[A.HERE/'rtl'/f'{stem}.v',A.HERE/'rtl'/f'{stem}_gate.v',A.HERE/'rtl'/f'{stem}_cmos.json']}
    specs={
     'sar16':('input clk,reset,start,comparator,output sample,eval,busy,valid,output [15:0] trial,code',['SAMPLE','EVAL','BUSY','VALID']+[p+str(i)for p in('TRIAL','CODE')for i in range(16)]),
     'sigma_delta16':('input clk,reset,bit_in,output [15:0] code,output valid',[f'CODE{i}'for i in range(16)]+['VALID']),
     'pipeline16':('input clk,reset,sample_valid,input [27:0] stage_codes,input [2:0] flash_therm,output [15:0] code,output valid,error',[f'CODE{i}'for i in range(16)]+['VALID','ERROR'])}
    header,outputs=specs[stem];converted=folder/'ir.v';converted.write_text(logic_ir(stem,top,header,outputs));results=[]
    for name,sources in [('rtl',[A.HERE/'rtl'/f'{stem}.v']),('gate',[runtime_resources.yosys_simcells(),A.HERE/'rtl'/f'{stem}_gate.v']),('ir',[converted])]:
        server.process(run,folder,['iverilog','-g2012','-s','replay','-o',str(folder/f'{name}.vvp'),*map(str,sources),str(test)],name+'-compile',manifest)
        server.process(run,folder,['vvp',str(folder/f'{name}.vvp')],name+'-replay',manifest)
        dest=folder/f'{name}-codes.csv';shutil.move(folder/'codes.csv',dest);results.append(dest.read_text().splitlines());run['artifacts'][name+'_replay']=str(dest)
    if not results[0]or results[0]!=results[1]or results[0]!=results[2]:raise EDAError('ADC16_REPLAY','Actual RTL, synthesized gates and CMOS-IR graph do not agree.')
    return results[0]


def replay_rows(result,count,width):
    """Agreement between engines is insufficient if all omitted the same rows."""
    if len(result)!=count:raise EDAError('ADC16_REPLAY','Digital output record is incomplete; every input timestamp must be retained.')
    rows=[]
    for i,line in enumerate(result):
        try:row=list(map(int,line.split()))
        except ValueError:raise EDAError('ADC16_REPLAY','Digital output contains an unknown or non-integer value.')
        if len(row)!=width or row[0]!=i or not 0<=row[1]<=65535 or any(v not in(0,1)for v in row[2:]):raise EDAError('ADC16_REPLAY','Digital timestamps, 16-bit codes and binary status must be complete and ordered.')
        rows.append(row)
    return rows


def sar_replay(server,run,folder,manifest,decisions,frames):
    Path(folder/'decisions.mem').write_text('\n'.join(str(int(r[8]))for r in decisions)+'\n')
    Path(folder/'expected.mem').write_text('\n'.join(f'{r["code"]:016b}'for r in frames)+'\n')
    tb='''module replay;
reg clk=0,reset=1,start=0,comparator=0;wire sample,eval,busy,valid;wire [15:0] trial,code;
reg decisions[0:COUNT-1];reg[15:0] expected[0:FRAMES-1];integer f,b,k,out;
sar16_controller dut(clk,reset,start,comparator,sample,eval,busy,valid,trial,code);
task tick;begin #5;clk=1;#5;clk=0;end endtask
initial begin $readmemb("decisions.mem",decisions);$readmemb("expected.mem",expected);out=$fopen("codes.csv","w");tick;reset=0;
for(f=0;f<FRAMES;f=f+1)begin
start=1;tick;start=0;if({sample,eval,busy,valid}!==4'b1010)$fatal(1,"acquisition entry");
for(k=0;k<16;k=k+1)begin tick;if(sample!==(k<15))$fatal(1,"acquisition clocks");end
tick;if(trial!==16'h8000||sample!==0||eval!==0)$fatal(1,"nonoverlap/trial");
for(b=15;b>=0;b=b-1)begin tick;if(eval!==1)$fatal(1,"evaluation");comparator=decisions[16*f+15-b];tick;end
if(valid!==1||code!==expected[f]||busy!==0)$fatal(1,"native SAR code replay");
$fwrite(out,"%0d %0d\\n",f,code);tick;end $fclose(out);$finish;end endmodule'''.replace('COUNT',str(len(decisions))).replace('FRAMES',str(len(frames)))
    result=replay(server,run,folder,manifest,'sar16','sar16_controller',tb)
    rows=replay_rows(result,len(frames),2)
    if any(code!=frame['code']for (_,code),frame in zip(rows,frames)):raise EDAError('ADC16_REPLAY','Actual SAR replay disagrees with the native comparator decision sequence.')
    return result


def filter_replay(server,run,folder,manifest,bits,resets):
    Path(folder/'bits.mem').write_text('\n'.join(map(str,bits))+'\n');Path(folder/'resets.mem').write_text('\n'.join(map(str,resets))+'\n')
    tb='''module replay;
reg clk=0,reset=1,bit_in=0;wire[15:0]code;wire valid;reg bits[0:COUNT-1],resets[0:COUNT-1];integer i,out;
sigma_delta16_filter dut(clk,reset,bit_in,code,valid);
initial begin $readmemb("bits.mem",bits);$readmemb("resets.mem",resets);out=$fopen("codes.csv","w");
for(i=0;i<COUNT;i=i+1)begin reset=resets[i];bit_in=bits[i];#5;clk=1;#5;clk=0;$fwrite(out,"%0d %0d %0d\\n",i,code,valid);end
$fclose(out);$finish;end endmodule'''.replace('COUNT',str(len(bits)))
    result=replay(server,run,folder,manifest,'sigma_delta16','sigma_delta16_filter',tb);oracle=cic3_reference(bits,resets)
    actual=[tuple(row[1:])for row in replay_rows(result,len(bits),3)]
    if actual!=oracle:raise EDAError('ADC16_FILTER','CIC3 modulo RTL disagrees with independent full-precision FIR.')
    return[(i,c)for i,(c,valid)in enumerate(actual)if valid]


def pipeline_replay(server,run,folder,manifest,stages,flashes,valids):
    if not len(stages)==len(flashes)==len(valids):raise EDAError('ADC16_PIPELINE','Stage and flash timestamps must agree.')
    if not stages or any(len(row)!=14 or any(type(v)is not int or not 0<=v<=3 for v in row)for row in stages)or any(type(v)is not int or not 0<=v<=7 for v in flashes)or any(type(v)is not int or v not in(0,1)for v in valids):raise EDAError('ADC16_PIPELINE','Fourteen two-bit stage words, three-bit flash and binary valid are required.')
    for name,values,width in [('stages',[sum(v<<(2*j)for j,v in enumerate(row))for row in stages],28),('flash',flashes,3),('valids',valids,1)]:Path(folder/f'{name}.mem').write_text('\n'.join(f'{v:0{width}b}'for v in values)+'\n')
    tb='''module replay;
reg clk=0,reset=1,sample_valid=0;reg[27:0]stage_codes;reg[2:0]flash_therm;wire[15:0]code;wire valid,error;
reg[27:0]stages[0:COUNT-1];reg[2:0]flash[0:COUNT-1];reg valids[0:COUNT-1];integer i,out;
pipeline16_align dut(clk,reset,sample_valid,stage_codes,flash_therm,code,valid,error);
initial begin $readmemb("stages.mem",stages);$readmemb("flash.mem",flash);$readmemb("valids.mem",valids);out=$fopen("codes.csv","w");#5;clk=1;#5;clk=0;reset=0;
for(i=0;i<COUNT;i=i+1)begin stage_codes=stages[i];flash_therm=flash[i];sample_valid=valids[i];#5;clk=1;#5;clk=0;$fwrite(out,"%0d %0d %0d %0d\\n",i,code,valid,error);end
$fclose(out);$finish;end endmodule'''.replace('COUNT',str(len(stages)))
    result=replay(server,run,folder,manifest,'pipeline16','pipeline16_align',tb);rows=replay_rows(result,len(stages),4)
    for i,code,valid,error in rows:
        expected_valid=i>=14 and bool(valids[i-14]);digits=[stages[i-14+j][j]for j in range(14)]if i>=14 else[]
        malformed=i>=14 and (any(v not in(0,1,3)for v in digits)or flashes[i]not in(0,1,3,7))
        if valid!=int(expected_valid and not malformed)or error!=int(expected_valid and malformed):raise EDAError('ADC16_ALIGNMENT','Pipeline sample identity/thermometer error flag mismatch.')
        if valid and code!=decode_pipeline(digits,flashes[i]):raise EDAError('ADC16_ALIGNMENT','Native pipeline output disagrees with independently aligned redundant digits.')
    return rows
