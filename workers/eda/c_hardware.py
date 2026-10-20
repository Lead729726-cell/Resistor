"""Deliberately bounded, unsigned C -> combinational RTL. No guessed C semantics."""
import re
from geometry import EDAError

PRELUDE='typedef unsigned int uint32_t;\n'

def lower(text, top):
    try:
        from pycparser import c_parser, c_ast as A
    except ImportError:
        raise EDAError('TOOL_MISSING','C hardware frontend requires pycparser 2.22 (pip install pycparser==2.22).')
    text=re.sub(r'/\*.*?\*/|//[^\n]*','',text,flags=re.S)
    text=re.sub(r'^\s*#\s*include\s*[<"]stdint.h[>"]\s*$','',text,flags=re.M)
    if '#' in text:raise EDAError('C_SUBSET','Only #include <stdint.h> is supported; no macros or arbitrary preprocessing.')
    try:tree=c_parser.CParser().parse(PRELUDE+text)
    except Exception as e:raise EDAError('C_PARSE',str(e))
    funcs=[v for v in tree.ext if isinstance(v,A.FuncDef)]
    if len(tree.ext)!=2 or len(funcs)!=1 or funcs[0].decl.name!=top:raise EDAError('C_SUBSET','Provide one uint32_t function matching top; globals, helpers and side effects are unsupported.')
    f=funcs[0];symbols={};args=[];lines=[];serial=0
    if f.decl.storage:raise EDAError('C_SUBSET','Function storage qualifiers are outside this stateless hardware subset.')
    def uint(t):
        return isinstance(t,A.TypeDecl) and not t.quals and isinstance(t.type,A.IdentifierType) and t.type.names in (['uint32_t'],['unsigned','int'])
    if not uint(f.decl.type.type):raise EDAError('C_SUBSET','Return type must be uint32_t or unsigned int.')
    if not f.decl.type.args:raise EDAError('C_SUBSET','At least one uint32_t input is required.')
    for p in f.decl.type.args.params:
        if not isinstance(p,A.Decl) or p.storage or not uint(p.type):raise EDAError('C_SUBSET','Only uint32_t value inputs are supported; no pointers, arrays, signed arithmetic or memory.')
        if not p.name or p.name in symbols or p.name=='result' or p.name.startswith('c_value_'):raise EDAError('C_SUBSET','Input names must be unique; result and c_value_ are reserved for generated RTL.')
        symbols[p.name]=p.name;args.append(p.name)
    if len(args)>16:raise EDAError('C_SUBSET','At most 16 uint32_t inputs.')
    def wire(expr):
        nonlocal serial
        if serial>=10000:raise EDAError('C_SUBSET','C expression budget exceeded (10000 SSA values).')
        serial+=1;name='c_value_'+str(serial);lines.append('wire [31:0] '+name+' = '+expr+';');return name
    def expr(n,env):
        if isinstance(n,A.ID):
            if n.name not in env:raise EDAError('C_UNINITIALIZED','Read of undefined or uninitialized variable: '+n.name)
            return env[n.name]
        if isinstance(n,A.Constant):
            # Explicit U constants eliminate signed constant-expression overflow
            # and implementation-defined promotion from this hardware subset.
            if n.type not in ('unsigned int',) or not re.fullmatch(r'(?:0[xX][0-9a-fA-F]+|[0-9]+)[uU]',n.value):raise EDAError('C_SUBSET','Use explicit 32-bit unsigned integer constants, e.g. 15u or 0xffu.')
            raw=n.value[:-1];v=int(raw,16 if raw.lower().startswith('0x') else 8 if len(raw)>1 and raw.startswith('0') else 10)
            if v>0xffffffff:raise EDAError('C_SUBSET','Constant exceeds uint32_t.')
            return "32'd"+str(v)
        if isinstance(n,A.BinaryOp):
            if n.op not in ('+','-','*','&','|','^','<<','>>','==','!=','<','<=','>','>=','&&','||'):raise EDAError('C_SUBSET','Unsupported or undefined-risk operator: '+n.op)
            if n.op in ('<<','>>'):
                if not isinstance(n.right,A.Constant):raise EDAError('C_SUBSET','Shift amount must be a constant from 0u to 31u.')
                shift=expr(n.right,env)
                if int(shift[4:])>31:raise EDAError('C_SUBSET','Shift amount must be below 32.')
            return wire('('+expr(n.left,env)+') '+n.op+' ('+expr(n.right,env)+')')
        if isinstance(n,A.UnaryOp) and n.op in ('~','!','+','-'):return wire(n.op+'('+expr(n.expr,env)+')')
        if isinstance(n,A.TernaryOp):return wire('('+expr(n.cond,env)+') ? ('+expr(n.iftrue,env)+') : ('+expr(n.iffalse,env)+')')
        if isinstance(n,A.Cast) and uint(n.to_type.type):return expr(n.expr,env)
        raise EDAError('C_SUBSET','Unsupported C expression: '+type(n).__name__)
    def body(node,env):
        if node is None:return env
        if isinstance(node,A.Compound):
            out=dict(env)
            for item in node.block_items or []:out=body(item,out)
            return out
        out=dict(env)
        if isinstance(node,A.Decl):
            if node.storage or node.quals or not uint(node.type) or node.name in out or node.name in ('result',top) or node.name.startswith('c_value_'):raise EDAError('C_SUBSET','Local declarations must be unique non-static, non-volatile uint32_t variables.')
            if node.init is not None:out[node.name]=expr(node.init,out)
            else:raise EDAError('C_SUBSET','Initialize each local variable explicitly.')
        elif isinstance(node,A.Assignment):
            if node.op!='=' or not isinstance(node.lvalue,A.ID) or node.lvalue.name not in out:raise EDAError('C_SUBSET','Use simple assignment to a defined uint32_t variable.')
            out[node.lvalue.name]=expr(node.rvalue,out)
        elif isinstance(node,A.If):
            cond=expr(node.cond,out);yes=body(node.iftrue,out);no=body(node.iffalse,out)
            for name in out:
                if yes[name]!=no[name]:out[name]=wire('('+cond+') ? ('+yes[name]+') : ('+no[name]+')')
        else:raise EDAError('C_SUBSET','Unsupported C statement: '+type(node).__name__+'; no loops, early return, calls, static state or dynamic memory.')
        return out
    items=f.body.block_items or []
    if not items or not isinstance(items[-1],A.Return):raise EDAError('C_SUBSET','End the function with one return statement.')
    env=dict(symbols)
    for item in items[:-1]:env=body(item,env)
    result=expr(items[-1].expr,env)
    rtl='module '+top+'('+', '.join('input [31:0] '+n for n in args)+', output [31:0] result);\n'+'\n'.join(lines)+'\nassign result = '+result+';\nendmodule\n'
    return {'verilog':rtl,'inputs':args,'c_source':PRELUDE+text,'semantics':'Stateless uint32_t combinational C; every expression is explicitly sized to 32 bits. GCC oracle checked independently when simulation is requested.'}
