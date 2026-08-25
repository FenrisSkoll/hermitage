import { useEffect, useRef } from 'react'
import { usePlayer } from '../context/PlayerContext'

type RGB = [number, number, number]
type SpectrumStyle = 'spectrum' | 'wave' | 'minimal'

function parseRgb(value: string, fallback: RGB): RGB {
  const parts = value.trim().split(/[ ,]+/).map(Number).filter(Number.isFinite)
  return parts.length >= 3 ? [parts[0], parts[1], parts[2]] : fallback
}
function mix(a: RGB, b: RGB, amount: number): RGB {
  const t = Math.max(0, Math.min(1, amount))
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]
}
function rgba(rgb: RGB, alpha: number) { return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` }

export function FullscreenSpectrum({ active, paletteKey = '', docked = true, reflection = true, style = 'spectrum' }: { active: boolean; paletteKey?: string; docked?: boolean; reflection?: boolean; style?: SpectrumStyle }) {
  const player = usePlayer()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const smoothedRef = useRef<Float32Array>(new Float32Array(0))
  const peaksRef = useRef<Float32Array>(new Float32Array(0))
  const paletteRef = useRef<{ low: RGB; mid: RGB; high: RGB }>({ low: [102,118,140], mid: [166,184,208], high: [235,241,246] })

  useEffect(() => {
    const css = getComputedStyle(document.documentElement)
    const art = parseRgb(css.getPropertyValue('--art-rgb'), [76,86,102])
    const accent = parseRgb(css.getPropertyValue('--accent-rgb'), [160,178,202])
    const secondary = parseRgb(css.getPropertyValue('--secondary-rgb'), art)
    paletteRef.current = { low: mix(secondary, accent, .34), mid: accent, high: mix(accent, [245,248,250], .62) }
  }, [paletteKey])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let frame = 0
    let frequencyData = new Uint8Array(0)
    let lastTimestamp = performance.now()

    const start = async () => {
      const ready = await player.prepareVisualizer()
      if (!ready || cancelled) return
      const analyser = player.getVisualizerAnalyser()
      const canvas = canvasRef.current
      if (!analyser || !canvas) return
      frequencyData = new Uint8Array(analyser.frequencyBinCount)

      const render = (timestamp: number) => {
        if (cancelled) return
        const context = canvas.getContext('2d')
        if (!context) return
        const rect = canvas.getBoundingClientRect()
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr))
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        context.setTransform(dpr,0,0,dpr,0,0)
        const cssWidth = width/dpr, cssHeight = height/dpr
        context.clearRect(0,0,cssWidth,cssHeight)
        analyser.getByteFrequencyData(frequencyData)

        const count = style === 'minimal' ? Math.max(42, Math.min(88, Math.floor(cssWidth/18))) : Math.max(56, Math.min(128, Math.floor(cssWidth/13)))
        if (smoothedRef.current.length !== count) { smoothedRef.current = new Float32Array(count); peaksRef.current = new Float32Array(count) }
        const smoothed = smoothedRef.current, peaks = peaksRef.current
        const dt = Math.min(40, Math.max(8, timestamp-lastTimestamp)); lastTimestamp = timestamp
        const minFrequency=20, maxFrequency=Math.min(20_000, analyser.context.sampleRate/2*.985), nyquist=analyser.context.sampleRate/2, binCount=analyser.frequencyBinCount
        const values = new Float32Array(count)
        for (let i=0;i<count;i++) {
          const f0=minFrequency*Math.pow(maxFrequency/minFrequency,i/count), f1=minFrequency*Math.pow(maxFrequency/minFrequency,(i+1)/count)
          const startBin=Math.max(1,Math.floor(f0/nyquist*binCount)), endBin=Math.max(startBin+1,Math.min(binCount-1,Math.ceil(f1/nyquist*binCount)))
          let sum=0,max=0,samples=0
          for(let bin=startBin;bin<=endBin;bin++){ const v=frequencyData[bin]; sum+=v; max=Math.max(max,v); samples++ }
          const raw=((samples?sum/samples:0)*.54+max*.46)/255, shaped=Math.pow(Math.max(0,(raw-.035)/.965),1.22)
          smoothed[i]+=(shaped-smoothed[i])*(shaped>smoothed[i]?.54:.18)
          peaks[i]=Math.max(smoothed[i],peaks[i]-dt*.00016); values[i]=smoothed[i]
        }

        const {low,mid,high}=paletteRef.current
        const useReflection=!docked&&reflection
        const baseline=docked?cssHeight-2:cssHeight*(useReflection?.70:.90)
        const usableHeight=docked?cssHeight*.78:cssHeight*.75
        const reflectionSpace=Math.max(0,cssHeight-baseline-2)

        if (style === 'wave') {
          const gradient=context.createLinearGradient(0,0,cssWidth,0); gradient.addColorStop(0,rgba(low,.75)); gradient.addColorStop(.5,rgba(mid,.98)); gradient.addColorStop(1,rgba(high,.78))
          context.beginPath()
          values.forEach((v,i)=>{ const x=i/(count-1)*cssWidth; const y=baseline-Math.max(1,v*usableHeight*.88); if(i===0) context.moveTo(x,y); else context.lineTo(x,y) })
          context.lineWidth=3; context.lineJoin='round'; context.lineCap='round'; context.strokeStyle=gradient; context.shadowBlur=18; context.shadowColor=rgba(mid,.42); context.stroke(); context.shadowBlur=0
          context.lineTo(cssWidth,baseline); context.lineTo(0,baseline); context.closePath(); const fill=context.createLinearGradient(0,baseline-usableHeight,0,baseline); fill.addColorStop(0,rgba(mid,.18)); fill.addColorStop(1,rgba(mid,.015)); context.fillStyle=fill; context.fill()
          if(useReflection&&reflectionSpace>5){
            context.save(); context.translate(0,baseline*2+3); context.scale(1,-1); context.globalAlpha=.16; context.filter='blur(2px)'; context.strokeStyle=gradient; context.lineWidth=2.5; context.beginPath(); values.forEach((v,i)=>{ const x=i/(count-1)*cssWidth; const y=baseline-Math.max(1,v*usableHeight*.88); if(i===0) context.moveTo(x,y); else context.lineTo(x,y) }); context.stroke(); context.restore()
          }
        } else {
          const slot=cssWidth/count, gap=style==='minimal'?Math.max(6,slot*.64):Math.max(3,Math.min(8,slot*.42)), barWidth=Math.max(1.5,Math.min(style==='minimal'?3:7,slot-gap))
          if(style==='spectrum'){
            const aura=context.createLinearGradient(0,0,cssWidth,0); aura.addColorStop(0,rgba(low,.08)); aura.addColorStop(.52,rgba(mid,.18)); aura.addColorStop(1,rgba(high,.07)); context.beginPath(); context.moveTo(0,baseline); values.forEach((v,i)=>context.lineTo((i+.5)*slot,baseline-Math.max(1,v*usableHeight*.92))); context.lineTo(cssWidth,baseline); context.closePath(); context.fillStyle=aura; context.shadowBlur=30; context.shadowColor=rgba(mid,.18); context.fill(); context.shadowBlur=0
          }
          values.forEach((value,i)=>{
            const position=i/Math.max(1,count-1), colour=position<.56?mix(low,mid,position/.56):mix(mid,high,(position-.56)/.44), peak=peaks[i]
            const barHeight=Math.max(style==='minimal'?1:2,value*usableHeight*(style==='minimal'?.78:1)), x=(i+.5)*slot-barWidth/2, y=baseline-barHeight
            if(style==='minimal'){ context.fillStyle=rgba(colour,.32+value*.55); context.fillRect(x,y,barWidth,barHeight) }
            else { const grad=context.createLinearGradient(0,y,0,baseline); grad.addColorStop(0,rgba(mix(colour,high,.28),.96)); grad.addColorStop(.26,rgba(colour,.78)); grad.addColorStop(1,rgba(colour,.16)); context.fillStyle=grad; if(value>.28){context.shadowBlur=7+value*13;context.shadowColor=rgba(colour,.42)} else context.shadowBlur=0; context.beginPath(); context.roundRect(x,y,barWidth,barHeight,Math.min(barWidth/2,3)); context.fill() }
            if(useReflection&&reflectionSpace>5){ const rh=Math.min(reflectionSpace*.92,barHeight*.42); const rg=context.createLinearGradient(0,baseline,0,baseline+rh); rg.addColorStop(0,rgba(colour,style==='minimal'?.12:.25)); rg.addColorStop(1,rgba(colour,0)); context.fillStyle=rg; context.fillRect(x,baseline+3,barWidth,rh) }
            if(style==='spectrum'){ const py=baseline-Math.max(3,peak*usableHeight); context.shadowBlur=8; context.shadowColor=rgba(colour,.4); context.fillStyle=rgba(mix(colour,high,.48),.4+peak*.5); context.beginPath(); context.arc(x+barWidth/2,py,Math.max(1,Math.min(2.15,barWidth*.28)),0,Math.PI*2); context.fill() }
          })
          context.shadowBlur=0
        }
        frame=requestAnimationFrame(render)
      }
      frame=requestAnimationFrame(render)
    }
    void start()
    return ()=>{ cancelled=true; if(frame) cancelAnimationFrame(frame) }
  }, [active,docked,reflection,style,player.visualizerReady,player.prepareVisualizer,player.getVisualizerAnalyser])

  return <canvas ref={canvasRef} className={`immersive-spectrum spectrum-style-${style} ${docked?'is-docked':'is-floating'} ${reflection&&!docked?'has-reflection':''} ${active?'is-active':''}`} aria-hidden="true" />
}
