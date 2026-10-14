import type {Device} from '../../contracts/src/index';

export interface CircuitFixture {id:string; title:string; devices:Device[]; deck:string; checks:{name:string;expected:number;unit:string;relative_tolerance:number}[];scope:string}
const resistor=(id:string,a:string,b:string,value:number,x:number,y:number):Device=>({id,name:id.toUpperCase(),kind:'resistor',pins:{'+':a,'-':b},parameters:{value},x,y});
const supply:Device={id:'v1',name:'V1',kind:'voltage',pins:{'+':'IN','-':'0'},parameters:{dc:1.8},x:180,y:180};
const ground:Device={id:'gnd',name:'GND',kind:'ground',pins:{G:'0'},parameters:{},x:180,y:360};
const commonScope='Ideal public teaching fixture · ngspice numerical analysis · no PDK/model/private data included · no layout/signoff.';
function op(id:string,title:string,rs:Device[],checks:CircuitFixture['checks']):CircuitFixture {
 const lines=rs.map(r=>`${r.name} ${r.pins['+']} ${r.pins['-']} ${r.parameters.value}`);
 return {id,title,devices:[{...supply},...rs,{...ground}],scope:commonScope,checks,
 deck:[`Resistor Edu ${id} - ideal linear OP fixture`,'* MIT. Actual solver required; this is not a stored result.','V1 IN 0 1.8',...lines,'.control','op','let supply_a = -i(V1)',`print v(${id==='parallel'?'IN':'OUT'}) supply_a`,'quit','.endc','.end',''].join('\n')};
}
const vout=(expected:number)=>({name:'v(out)',expected,unit:'V',relative_tolerance:1e-6});
const current=(expected:number)=>({name:'supply_a',expected,unit:'A',relative_tolerance:1e-6});
export const circuitFixtures:CircuitFixture[]=[
 op('divider','1.8V equal divider',[resistor('r1','IN','OUT',10000,360,180),resistor('r2','OUT','0',10000,360,360)],[vout(.9),current(90e-6)]),
 op('loaded-divider','Divider with load',[resistor('r1','IN','OUT',10000,360,180),resistor('r2','OUT','0',10000,360,360),resistor('rl','OUT','0',10000,540,360)],[vout(.6),current(120e-6)]),
 op('parallel','Two parallel branches',[resistor('ra','IN','0',1000,360,180),resistor('rb','IN','0',2000,540,180)],[{...vout(1.8),name:'v(in)'},current(.0027)]),
 op('series','Two series drops',[resistor('ra','IN','OUT',1000,360,180),resistor('rb','OUT','0',2000,360,360)],[vout(1.2),current(.0006)]),
 op('thevenin','Loaded Thevenin divider',[resistor('r1','IN','OUT',10000,360,180),resistor('r2','OUT','0',10000,360,360),resistor('rl','OUT','0',5000,540,360)],[vout(.45),current(135e-6)]),
 {id:'rc-charge',title:'RC charge',devices:[],scope:commonScope,checks:[{name:'at_tau',expected:1.8*(1-Math.exp(-1)),unit:'V',relative_tolerance:.002}],deck:'Resistor Edu RC charge\n* MIT. Time referenced to step at 1us; max step 20ns.\nV1 IN 0 PULSE(0 1.8 1u 1n 1n 100u 200u)\nR1 IN OUT 10k\nC1 OUT 0 1n\n.control\ntran 20n 60u\nmeas tran at_tau FIND v(OUT) AT=11u\nquit\n.endc\n.end\n'},
 {id:'rc-discharge',title:'RC discharge with UIC',devices:[],scope:commonScope+' Explicit UIC/initial charge; standalone deck only.',checks:[{name:'at_tau',expected:1.8*Math.exp(-1),unit:'V',relative_tolerance:.002}],deck:'Resistor Edu RC discharge\n* MIT. Explicit initial capacitor voltage and UIC.\nR1 OUT 0 10k\nC1 OUT 0 1n IC=1.8\n.control\ntran 20n 60u uic\nmeas tran at_tau FIND v(OUT) AT=10u\nquit\n.endc\n.end\n'},
 {id:'rc-ac',title:'RC frequency response',devices:[],scope:commonScope,checks:[{name:'at_fc',expected:1/Math.sqrt(2),unit:'V/V',relative_tolerance:.002}],deck:'Resistor Edu RC AC\n* MIT. Small signal, unity AC source.\nV1 IN 0 DC 0 AC 1\nR1 IN OUT 10k\nC1 OUT 0 1n\n.control\nac dec 200 10 10meg\nlet gain = mag(v(OUT))\nmeas ac at_fc FIND gain AT=15915.4943092\nquit\n.endc\n.end\n'}
];
export const getCircuitFixture=(id:string)=>circuitFixtures.find(f=>f.id===id);
