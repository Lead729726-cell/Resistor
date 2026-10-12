"""Publication plot from actual native analog data and measured digital words."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'.runtime/sigma-delta8/native-sine'
a=np.loadtxt(folder/'waveform.dat',skiprows=1)
c=np.loadtxt(folder/'adc-codes.csv',delimiter=',',skiprows=1)[2:]
m=json.loads((folder/'run.json').read_text())['measurements']
plt.rcParams.update({'font.size':10,'axes.grid':True,'grid.alpha':.22,'axes.spines.top':False,'axes.spines.right':False})
fig,ax=plt.subplots(2,2,figsize=(15,8),layout='constrained')
ax[0,0].plot(a[::16,0]*1e3,a[::16,1],label='Actual input',lw=1.4,color='#245b91')
ax[0,0].step(c[:,0]*1e3,c[:,2],where='post',label='Decoded 8-bit output (CIC delay)',lw=1.2,color='#aa6132')
ax[0,0].set(xlabel='Time (ms)',ylabel='Voltage (V)',title='Transistor modulator → RTL/gate decimation')
ax[0,0].legend(fontsize=9)
last=a[(a[:,0]>.012)&(a[:,0]<.012025)]
ax[0,1].plot((last[:,0]-.012)*1e6,last[:,4],label='1-bit latched output',lw=1,color='#245b91')
ax[0,1].plot((last[:,0]-.012)*1e6,last[:,5],label='Integrator output',lw=1.2,color='#aa6132')
ax[0,1].set(xlabel='Time from 12 ms (µs)',ylabel='Voltage (V)',title='Actual MOS bitstream and integrator')
ax[0,1].legend(fontsize=9)
x=c[:,1]-c[:,1].mean();power=np.abs(np.fft.rfft(x))**2;power[1:-1]*=2
relative=10*np.log10(np.maximum(power[1:]/power[int(m['fft_tone_bin'])],1e-15))
frequency=np.fft.rfftfreq(len(x),d=1/3906.25)[1:]
ax[1,0].stem(frequency,relative,basefmt=' ',linefmt='C0-',markerfmt='C0o',bottom=-90)
ax[1,0].set(xlabel='Output frequency (Hz)',ylabel='Power relative to tone (dBc)',title=f'Coherent 64-word FFT · SINAD {m["SINAD_dB"]:.2f} dB · ENOB {m["ENOB_bits"]:.2f}')
ax[1,0].set_ylim(-90,4)
ax[1,1].axis('off')
ax[1,1].text(.02,.96,'VERIFIED NOMINAL REFERENCE',size=13,weight='bold',va='top')
ax[1,1].text(.02,.83,'SKY130 TT · 27°C · VDD 1.8 V\nInput 0.9 V ± 0.6 V at 183.10546875 Hz\n1 MHz modulator / CIC2 ×256 / 3.90625 kS/s\n8-bit interface · 7.03125 mV / code\n66 output words; discard first two\nFull Nyquist residual includes harmonics\nRTL = synthesized gates = integer reference\nThermal/flicker noise, jitter, PVT/MC not tested\nFull digital MOS timing and physical signoff not run',size=11,va='top',linespacing=1.8)
fig.suptitle('Resistor · Sigma Delta 8-bit ADC',size=20,weight='bold')
out=ROOT/'examples/sigma-delta8/adc-measurements.png'
fig.savefig(out,dpi=160)
print(out)
