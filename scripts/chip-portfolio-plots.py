"""Standalone portfolio figures from saved native ngspice CSV only."""
import csv,json,math
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]/'examples/chip-portfolio'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'figure.facecolor':'#111820','axes.facecolor':'#19232e','axes.edgecolor':'#536273','axes.labelcolor':'#d9e2ee','text.color':'#e8eef5','xtick.color':'#aebccd','ytick.color':'#aebccd','grid.color':'#425266','grid.alpha':.35,'savefig.facecolor':'#111820','legend.facecolor':'#1d2a37','legend.edgecolor':'#536273'})
TITLES={'chip_ldo':'LDO | 1.8 V to 1.2 V','chip_sc_dcdc':'DC-DC | 2:1 switched-capacitor','chip_pll':'PLL | Type-I XOR, N = 1','chip_vco':'VCO | 3-stage current-starved ring','chip_ota':'OTA | 5-MOS active-load amplifier','chip_comparator':'Comparator | differential + CMOS output'}
def data(kind):
    with (ROOT/kind/'waveforms.csv').open() as f:
        rows=list(csv.DictReader(f));cols={k:np.array([float(r[k]) for r in rows]) for k in rows[0]}
    return {k.split(' [')[0]:v for k,v in cols.items()}
def plot(ax,kind):
    d=data(kind);x=d['time_or_frequency'];y=d['OUT'] if 'OUT' in d else None
    ax.set_title(TITLES[kind],loc='left',fontweight='bold',pad=12);ax.grid(True)
    if kind=='chip_ota':
        ax.semilogx(x,20*np.log10(d['OUT_gain']),color='#73bafa',lw=1.5);ax.set_xlabel('Frequency (Hz)');ax.set_ylabel('Gain (dB)')
    elif kind=='chip_pll':
        ax.plot(x*1e6,d['CTRL'],color='#73bafa',lw=1,label='Loop control');ax.plot(x*1e6,d['TUNE'],color='#69d4b3',lw=1,label='VCO tuning');ax.set_xlabel('Time (us)');ax.set_ylabel('Voltage (V)');ax.legend(fontsize=8)
    elif kind=='chip_comparator':
        ax.plot(x*1e6,y,color='#73bafa',lw=1.1,label='OUT');ax.plot(x*1e6,d['INP'],color='#69d4b3',lw=.8,label='INP');ax.plot(x*1e6,d['INN'],color='#dbb879',lw=.8,label='INN');ax.set_xlabel('Time (us)');ax.set_ylabel('Voltage (V)');ax.legend(fontsize=8)
    elif kind=='chip_vco':
        select=(x>=2.5e-6)&(x<=2.65e-6);ax.plot(x[select]*1e9,y[select],color='#73bafa',lw=1.3);ax.set_xlabel('Time (ns)');ax.set_ylabel('OUT (V)')
    else:
        ax.plot(x*1e6,y,color='#73bafa',lw=1.1);ax.axhline(1.2 if kind=='chip_ldo' else .9,color='#69d4b3',ls='--',lw=.9,label='Nominal target');ax.set_xlabel('Time (us)');ax.set_ylabel('OUT (V)');ax.legend(fontsize=8)
    m=json.loads((ROOT/kind/'results-tt.json').read_text())['measurements']
    label={'chip_ldo':f"Heavy load: {m.get('heavy_load_output_V',0):.4f} V | undershoot: {m.get('load_step_undershoot_V',0)*1e3:.1f} mV",
           'chip_sc_dcdc':f"Mean: {m.get('settled_output_mean_V',0):.4f} V | stage efficiency: {m.get('power_stage_efficiency',0)*100:.2f}%",
           'chip_pll':f"Output: {m.get('output_frequency_Hz',0)/1e6:.5f} MHz | phase span: {m.get('phase_error_span_deg',0):.2f} deg",
           'chip_vco':f"Control: 0.9 V | output: {m.get('output_frequency_Hz',0)/1e6:.3f} MHz",
           'chip_ota':f"Low-frequency gain: {m.get('low_frequency_gain_dB',0):.2f} dB",
           'chip_comparator':'3 directed static-level cases | 100 mV differential input'}[kind]
    ax.text(0,-.31,label,transform=ax.transAxes,color='#b4c6d9',fontsize=8)

for kind in TITLES:
    fig,ax=plt.subplots(figsize=(9,4.6));plot(ax,kind);fig.subplots_adjust(left=.11,right=.98,top=.86,bottom=.27)
    fig.text(.11,.02,'Actual SKY130 ngspice | TT, 27 C, 1.8 V | Schematic reference; no physical signoff',fontsize=8,color='#92a6bd')
    fig.savefig(ROOT/kind/'waveform.png',dpi=180);fig.savefig(ROOT/kind/'waveform.svg');plt.close(fig)
fig,axes=plt.subplots(2,3,figsize=(15,8.8))
for ax,kind in zip(axes.flatten(),TITLES):plot(ax,kind)
fig.suptitle('RESISTOR / Chip Design Portfolio References',x=.055,ha='left',fontsize=19,fontweight='bold')
fig.subplots_adjust(left=.055,right=.985,top=.88,bottom=.16,wspace=.32,hspace=.9)
fig.text(.055,.02,'Six editable transistor-level cores | Actual TT waveforms | PLL fails the saved SS/FF lock criteria | DRC / LVS / PEX not run',fontsize=9,color='#afc2d9')
fig.savefig(ROOT/'portfolio-overview.png',dpi=160);fig.savefig(ROOT/'portfolio-overview.svg');plt.close(fig)
print('Saved 6 individual figures and the portfolio overview from native CSV.')
