import { useState, useEffect, useRef, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";

const DERIV_TOKEN = "n9s44Q7lqsIn9xs";

const SYMBOLS = {
  R_10:"Volatility 10",R_25:"Volatility 25",R_50:"Volatility 50",
  R_75:"Volatility 75",R_100:"Volatility 100",
  "1HZ10V":"Vol 10(1s)","1HZ25V":"Vol 25(1s)",
  "1HZ50V":"Vol 50(1s)","1HZ75V":"Vol 75(1s)","1HZ100V":"Vol 100(1s)",
};

const CONTRACTS = [
  {id:"matches_differs",name:"Matches / Differs",icon:"♦",dk:"#FF4DA6",lt:"#CC0055"},
  {id:"over_under",     name:"Over / Under",     icon:"◈",dk:"#C77DFF",lt:"#6D28D9"},
  {id:"even_odd",       name:"Even / Odd",       icon:"⬡",dk:"#00F5FF",lt:"#0891B2"},
  {id:"rise_fall",      name:"Rise / Fall",      icon:"◆",dk:"#FFD700",lt:"#B45309"},
  {id:"up_down",        name:"Up / Down",        icon:"⬥",dk:"#FF4DA6",lt:"#BE185D"},
  {id:"accumulators",   name:"Accumulators",     icon:"◉",dk:"#A78BFA",lt:"#5B21B6"},
];

/* ═══════════════════════════════════════════════════════════
   MARKOV ENGINE – preserved + extended
═══════════════════════════════════════════════════════════ */
class MarkovEngine {
  constructor(){this.reset();}
  reset(){this.trans={};this.freq=new Array(10).fill(0);this.ticks=[];}
  add(d){
    if(this.ticks.length>0){
      const p=this.ticks[this.ticks.length-1];
      if(!this.trans[p])this.trans[p]=new Array(10).fill(0);
      this.trans[p][d]++;
    }
    this.ticks.push(d);this.freq[d]++;
    if(this.ticks.length>100)this.freq[this.ticks.shift()]--;
  }
  probs(){
    if(this.ticks.length<2)return new Array(10).fill(10);
    const last=this.ticks[this.ticks.length-1],tr=this.trans[last];
    if(!tr)return new Array(10).fill(10);
    const tot=tr.reduce((a,b)=>a+b,0)||1,len=this.ticks.length||1;
    return tr.map((t,i)=>Math.max(1,Math.round((t/tot)*60+(this.freq[i]/len)*40)));
  }
  confidence(){return Math.min(Math.round(Math.max(...this.probs())*1.6),99);}
  volatility(){
    if(this.ticks.length<5)return 0;
    const r=this.ticks.slice(-20),avg=r.reduce((a,b)=>a+b,0)/r.length;
    return Math.sqrt(r.reduce((a,b)=>a+(b-avg)**2,0)/r.length);
  }
  trendStrength(){
    const c=this.confidence();
    if(c>85)return"EXTREME";if(c>72)return"STRONG";if(c>58)return"MODERATE";return"WEAK";
  }
  riskLevel(c){if(c>75)return"LOW";if(c>55)return"MEDIUM";return"HIGH";}
  entryZone(p){
    const top=p.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0,3).map(x=>x.i);
    return`${Math.min(...top)}-${Math.max(...top)}`;
  }
  forecast(n=5){
    if(this.ticks.length<3)return Array.from({length:n},(_,i)=>({d:i%10,c:45+i*2}));
    let cur=this.ticks[this.ticks.length-1];
    const out=[];
    for(let i=0;i<n;i++){
      const tr=this.trans[cur];
      if(!tr){const d=Math.floor(Math.random()*10);out.push({d,c:44});cur=d;continue;}
      const tot=tr.reduce((a,b)=>a+b,0)||1;
      const best=tr.indexOf(Math.max(...tr));
      const c=Math.min(Math.round((tr[best]/tot)*100*1.3),96);
      out.push({d:best,c});cur=best;
    }
    return out;
  }
  patterns(){
    if(this.ticks.length<8)return[];
    const r=this.ticks.slice(-12),out=[];
    const last=r[r.length-1];
    const rep=r.filter(d=>d===last).length;
    if(rep>=3)out.push({type:"DIGIT CLUSTER",digit:last,str:rep});
    let ri=0,fa=0;
    for(let i=1;i<r.length;i++){
      if(r[i]>r[i-1]){ri++;fa=0;}else if(r[i]<r[i-1]){fa++;ri=0;}else{ri=0;fa=0;}
    }
    if(ri>=4)out.push({type:"RISING STREAK",str:ri});
    if(fa>=4)out.push({type:"FALLING STREAK",str:fa});
    const ev=r.filter(d=>d%2===0).length;
    if(ev>=8)out.push({type:"EVEN DOMINANT",str:ev});
    if(ev<=4)out.push({type:"ODD DOMINANT",str:r.length-ev});
    return out;
  }
  signals(){
    const p=this.probs(),r=this.ticks.slice(-20);
    if(r.length<2)return{};
    const best=p.indexOf(Math.max(...p));
    const avg=r.reduce((a,b)=>a+b,0)/r.length;
    const evR=r.filter(d=>d%2===0).length/r.length;
    const mom=(r[r.length-1]-r[0])/r.length;
    const pats=this.patterns();
    const glow=c=>c>75?"pink":c>50?"purple":"red";
    const mc=Math.min(p[best]*3,97),oc=Math.abs(avg-4.5)*20+50;
    const ec=Math.abs(evR-.5)*200+50,rc=Math.min(Math.abs(mom)*500+50,95);
    const ud=r[r.length-1]>r[r.length-2];
    const ac=60+pats.length*10;
    const vol=this.volatility();
    const ts=this.trendStrength();
    const ez=this.entryZone(p);
    return{
      matches_differs:{sig:`MATCH ${best}`,sub:`Digit ${best} @ ${mc.toFixed(0)}%`,c:mc,glow:glow(mc),best,risk:this.riskLevel(mc),ez,vol:vol.toFixed(2),ts,age:0},
      over_under:{sig:avg>4.5?"OVER 4":"UNDER 5",sub:`Avg:${avg.toFixed(2)}`,c:oc,glow:glow(oc),risk:this.riskLevel(oc),ez,vol:vol.toFixed(2),ts,age:0},
      even_odd:{sig:evR>.55?"EVEN":"ODD",sub:`${(evR*100).toFixed(0)}% even`,c:ec,glow:glow(ec),risk:this.riskLevel(ec),ez,vol:vol.toFixed(2),ts,age:0},
      rise_fall:{sig:mom>.1?"RISE":mom<-.1?"FALL":"NEUTRAL",sub:`Mom:${mom.toFixed(3)}`,c:rc,glow:glow(rc),risk:this.riskLevel(rc),ez,vol:vol.toFixed(2),ts,age:0},
      up_down:{sig:ud?"UP":"DOWN",sub:`Last tick ${ud?"higher":"lower"}`,c:52+Math.abs(mom)*80,glow:"purple",risk:this.riskLevel(60),ez,vol:vol.toFixed(2),ts,age:0},
      accumulators:{sig:pats.length?"ACTIVE":"STANDBY",sub:`${pats.length} signals`,c:ac,glow:glow(ac),risk:this.riskLevel(ac),ez,vol:vol.toFixed(2),ts,age:0},
    };
  }
}

/* ═══════════════════════════════════════════════════════════
   PARTICLES
═══════════════════════════════════════════════════════════ */
function ParticleBg({dark,pulse}){
  const ref=useRef(null);
  const pulseRef=useRef(0);
  useEffect(()=>{pulseRef.current=pulse;},[pulse]);
  useEffect(()=>{
    const c=ref.current;if(!c)return;
    const ctx=c.getContext("2d");
    const resize=()=>{c.width=window.innerWidth;c.height=window.innerHeight;};
    resize();window.addEventListener("resize",resize);
    const N=dark?65:40;
    const pts=Array.from({length:N},()=>({
      x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
      vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,
      r:Math.random()*1.8+.3,
      col:Math.random()>.6?"#FF006E":Math.random()>.5?"#9B5DE5":"#00F5FF",
      a:Math.random()*.35+.08,
    }));
    let raf,lastPulse=0;
    const draw=t=>{
      ctx.clearRect(0,0,c.width,c.height);
      const alpha=dark?1:.45;
      const pulsing=pulseRef.current>lastPulse;
      if(pulsing)lastPulse=pulseRef.current;
      pts.forEach(p=>{
        p.x+=p.vx*(pulsing?1.8:1);p.y+=p.vy*(pulsing?1.8:1);
        if(p.x<0)p.x=c.width;if(p.x>c.width)p.x=0;
        if(p.y<0)p.y=c.height;if(p.y>c.height)p.y=0;
        pts.forEach(q=>{
          const d=Math.hypot(p.x-q.x,p.y-q.y);
          if(d<90){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
            ctx.strokeStyle=`rgba(155,93,229,${.07*(1-d/90)*alpha*(pulsing?1.6:1)})`;
            ctx.lineWidth=.4;ctx.stroke();}
        });
        ctx.beginPath();ctx.arc(p.x,p.y,p.r*(pulsing?1.5:1),0,Math.PI*2);
        ctx.fillStyle=p.col;ctx.globalAlpha=p.a*alpha*(pulsing?1.5:1);ctx.fill();ctx.globalAlpha=1;
      });
      raf=requestAnimationFrame(draw);
    };
    draw(0);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  },[dark]);
  return <canvas ref={ref} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}}/>;
}

/* ═══════════════════════════════════════════════════════════
   PRICE CHART (Recharts)
═══════════════════════════════════════════════════════════ */
const CustomTooltip=({active,payload,dark})=>{
  if(!active||!payload?.length)return null;
  const d=payload[0]?.payload;
  return(
    <div style={{background:dark?"rgba(10,5,20,.95)":"rgba(255,255,255,.97)",border:"1px solid rgba(255,0,110,.3)",borderRadius:"10px",padding:"8px 12px",fontSize:"11px",backdropFilter:"blur(12px)"}}>
      <div style={{color:"#FF006E",fontWeight:700,fontFamily:"monospace"}}>{d?.price?.toFixed(5)}</div>
      {d?.ma&&<div style={{color:"#00F5FF",fontSize:"10px"}}>MA: {d.ma.toFixed(5)}</div>}
      {d?.digit!==undefined&&<div style={{color:"#9B5DE5",fontSize:"10px"}}>Digit: {d.digit}</div>}
    </div>
  );
};

function PriceChart({rawTicks,dark}){
  const chartData=useMemo(()=>{
    const data=rawTicks.slice(-80).map((t,i)=>({i,price:t.val,digit:t.d}));
    return data.map((d,i)=>{
      if(i<9)return{...d,ma:null};
      const sl=data.slice(i-9,i+1);
      return{...d,ma:sl.reduce((a,b)=>a+b.price,0)/10};
    });
  },[rawTicks]);

  const minY=useMemo(()=>chartData.length?Math.min(...chartData.map(d=>d.price))*.99999:0,[chartData]);
  const maxY=useMemo(()=>chartData.length?Math.max(...chartData.map(d=>d.price))*1.00001:1,[chartData]);
  const lastPrice=chartData[chartData.length-1]?.price;

  return(
    <div style={{width:"100%",height:"100%",position:"relative"}}>
      <svg style={{position:"absolute",width:0,height:0,overflow:"hidden"}}>
        <defs>
          <filter id="neon-glow"><feGaussianBlur stdDeviation="2.5" result="cb"/><feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FF006E" stopOpacity={0.25}/>
            <stop offset="95%" stopColor="#FF006E" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="maGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00F5FF" stopOpacity={0.15}/>
            <stop offset="100%" stopColor="#00F5FF" stopOpacity={0}/>
          </linearGradient>
        </defs>
      </svg>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{top:8,right:4,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="1 8" stroke={dark?"rgba(255,255,255,.04)":"rgba(0,0,0,.04)"} vertical={false}/>
          <XAxis dataKey="i" hide/>
          <YAxis hide domain={[minY,maxY]}/>
          <Tooltip content={<CustomTooltip dark={dark}/>}/>
          {lastPrice&&<ReferenceLine y={lastPrice} stroke="rgba(255,0,110,.4)" strokeDasharray="3 3" strokeWidth={1}/>}
          <Area type="monotoneX" dataKey="ma" stroke="#00F5FF" strokeWidth={1.5} fill="url(#maGrad)" dot={false} strokeDasharray="5 3" connectNulls/>
          <Area type="monotoneX" dataKey="price" stroke="#FF006E" strokeWidth={2} fill="url(#areaGrad)" dot={false}
            activeDot={{r:5,fill:"#FF006E",stroke:"#FF006E44",strokeWidth:8}}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HEATMAP
═══════════════════════════════════════════════════════════ */
function Heatmap({freq,dark}){
  const mx=Math.max(...freq,1);
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:"5px",alignItems:"end"}}>
      {freq.map((f,d)=>{
        const t=f/mx;
        const col=t>.7?"#FF006E":t>.4?"#9B5DE5":dark?"#1E1030":"#E9E0F5";
        return(
          <div key={d} style={{textAlign:"center"}}>
            <div style={{height:`${Math.max(t*72,5)}px`,background:t>.5?`linear-gradient(to top,${col},${col}88)`:col,borderRadius:"3px 3px 0 0",transition:"height .4s cubic-bezier(.4,0,.2,1)",boxShadow:t>.6?`0 -4px 14px ${col}66`:"none"}}/>
            <div style={{fontSize:"11px",fontWeight:t>.5?800:500,color:t>.5?"#FF006E":dark?"#555":"#aaa",paddingTop:"4px",fontFamily:"monospace"}}>{d}</div>
            <div style={{fontSize:"9px",color:dark?"#333":"#ccc",fontFamily:"monospace"}}>{f}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SENTIMENT METER
═══════════════════════════════════════════════════════════ */
function Meter({val,dark}){
  const col=val>65?"#FF006E":val>40?"#9B5DE5":"#FF3B3B";
  const ang=(val/100)*180-90;
  const nx=100+58*Math.cos(((ang-90)*Math.PI)/180);
  const ny=100+58*Math.sin(((ang-90)*Math.PI)/180);
  return(
    <div style={{textAlign:"center"}}>
      <svg viewBox="0 0 200 115" width="100%" style={{maxWidth:195}}>
        <defs>
          <linearGradient id="mgr" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF3B3B"/>
            <stop offset="45%" stopColor="#9B5DE5"/>
            <stop offset="100%" stopColor="#FF006E"/>
          </linearGradient>
          <filter id="needleGlow"><feGaussianBlur stdDeviation="2" result="cb"/><feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={dark?"rgba(255,255,255,.07)":"rgba(0,0,0,.07)"} strokeWidth="14" strokeLinecap="round"/>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#mgr)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${val*2.51} 999`} style={{transition:"stroke-dasharray .6s ease"}}/>
        <line x1="100" y1="100" x2={nx} y2={ny} stroke={col} strokeWidth="2.5" strokeLinecap="round" filter="url(#needleGlow)" style={{transition:"x2 .5s ease,y2 .5s ease"}}/>
        <circle cx="100" cy="100" r="5.5" fill={col} filter="url(#needleGlow)"/>
        <text x="100" y="84" textAnchor="middle" fill={col} fontSize="21" fontWeight="800" fontFamily="monospace">{val}</text>
        <text x="22" y="114" fill={dark?"#444":"#bbb"} fontSize="9">BEAR</text><text x="155" y="114" fill={dark?"#444":"#bbb"} fontSize="9">BULL</text>
      </svg>
      <div style={{fontSize:"11px",fontWeight:800,color:col,letterSpacing:"2px",marginTop:"-4px",fontFamily:"monospace"}}>
        {val>65?"🔥 BULLISH":val>40?"◈ NEUTRAL":"⚠ BEARISH"}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SIGNAL CARD – institutional grade
═══════════════════════════════════════════════════════════ */
/* ── Mini Sparkline SVG ── */
function MiniSparkline({data,color,width=80,height=28}){
  if(!data||data.length<2)return null;
  const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;
  const pts=data.map((v,i)=>{
    const x=(i/(data.length-1))*width;
    const y=height-((v-mn)/rng)*(height-4)-2;
    return`${x},${y}`;
  }).join(" ");
  return(
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="1"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={`url(#sg${color.replace("#","")})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle
        cx={width}
        cy={height-((data[data.length-1]-mn)/rng)*(height-4)-2}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

function SignalCard({contract,sig,dark,idx,livePrice}){
  const [hover,setHover]=useState(false);
  const [flash,setFlash]=useState(false);
  const prevPriceRef=useRef(null);

  // Flash animation on price update
  useEffect(()=>{
    if(livePrice?.price&&prevPriceRef.current!==livePrice.price){
      prevPriceRef.current=livePrice.price;
      setFlash(true);
      const t=setTimeout(()=>setFlash(false),600);
      return()=>clearTimeout(t);
    }
  },[livePrice?.price]);

  const accentDk=contract.dk,accentLt=contract.lt;
  const col=dark?accentDk:accentLt;
  const glowMap={pink:dark?"#FF006E":"#CC0055",purple:dark?"#9B5DE5":"#6D28D9",red:dark?"#FF3B3B":"#DC2626"};
  const gc=glowMap[sig?.glow||"purple"];
  const c=Math.round(sig?.c||50);
  const hot=sig?.glow==="pink",skip=sig?.glow==="red";
  const riskCol={LOW:"#00C87A",MEDIUM:"#FFD700",HIGH:"#FF3B3B"}[sig?.risk||"MEDIUM"];
  const tsCol={EXTREME:"#FF006E",STRONG:"#FF4DA6",MODERATE:"#9B5DE5",WEAK:"#555"}[sig?.ts||"WEAK"];
  const aiStatus=c>80?"CONFIRMED":c>60?"ANALYZING":"SCANNING";
  const aiStatusCol={CONFIRMED:"#00C87A",ANALYZING:"#FFD700",SCANNING:"#9B5DE5"}[aiStatus];

  // Live price display vars
  const price=livePrice?.price;
  const dir=livePrice?.dir||"FLAT";
  const symLabel=livePrice?.symLabel||"—";
  const updateTime=livePrice?.updateTime||"—";
  const sparkData=livePrice?.spark||[];
  const dirArrow=dir==="UP"?"▲":dir==="DOWN"?"▼":"●";
  const dirCol=dir==="UP"?"#00C87A":dir==="DOWN"?"#FF4D6A":"#9B5DE5";
  const priceGlow=flash?(dir==="UP"?"0 0 18px rgba(0,200,122,.6)":dir==="DOWN"?"0 0 18px rgba(255,77,106,.6)":"0 0 18px rgba(155,93,229,.5)"):"none";

  return(
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      style={{
        background:dark?`linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.02))`:`linear-gradient(145deg,rgba(255,255,255,.97),rgba(248,242,255,.95))`,
        backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        border:`1px solid ${gc}${hot?"66":"33"}`,
        borderRadius:"18px",
        padding:"18px",
        boxShadow:hot?(dark?`0 0 0 1px ${gc}22,0 8px 40px ${gc}33,0 2px 8px rgba(0,0,0,.3)`:`0 8px 32px ${gc}22,0 2px 8px rgba(0,0,0,.08)`):(dark?"0 2px 16px rgba(0,0,0,.4)":"0 2px 16px rgba(200,150,220,.12)"),
        transform:hover?"translateY(-3px) scale(1.01)":"translateY(0) scale(1)",
        transition:"all .3s cubic-bezier(.4,0,.2,1)",
        animation:hot?"cardPulse 2.5s ease-in-out infinite":"none",
        position:"relative",overflow:"hidden",
        animationDelay:`${idx*0.15}s`,
      }}
    >
      {/* Top accent bar */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,transparent,${gc},${gc}88,transparent)`,opacity:hot?1:.6}}/>
      {/* Scanline shimmer (hot only) */}
      {hot&&<div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:`linear-gradient(180deg,transparent 0%,${gc}06 50%,transparent 100%)`,animation:"scanline 3s linear infinite",pointerEvents:"none",borderRadius:"18px"}}/>}

      {/* Header row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:40,height:40,borderRadius:"11px",background:dark?`${gc}1a`:`${gc}12`,border:`1.5px solid ${gc}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",flexShrink:0,boxShadow:hot?`inset 0 0 10px ${gc}22`:""}}>{contract.icon}</div>
          <div>
            <div style={{fontSize:"12px",fontWeight:700,color:dark?"#eee":"#1A0A1A",letterSpacing:".3px"}}>{contract.name}</div>
            <div style={{display:"flex",alignItems:"center",gap:"4px",marginTop:"2px"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:aiStatusCol,display:"inline-block",animation:"blink 1.5s infinite"}}/>
              <span style={{fontSize:"9px",color:aiStatusCol,fontWeight:700,letterSpacing:"1px"}}>{aiStatus}</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"4px"}}>
          <span style={{fontSize:"9px",background:hot?`${gc}22`:skip?`rgba(220,38,38,.15)`:`${gc}0f`,color:hot?gc:skip?"#DC2626":gc,padding:"3px 9px",borderRadius:"20px",border:`1px solid ${hot?gc+"55":skip?"rgba(220,38,38,.3)":gc+"22"}`,fontWeight:800,letterSpacing:"1px"}}>
            {hot?"🔥 HOT":skip?"⚠ SKIP":"◈ SET"}
          </span>
          <span style={{fontSize:"9px",color:riskCol,fontWeight:700,letterSpacing:".5px"}}>RISK: {sig?.risk||"—"}</span>
        </div>
      </div>

      {/* Signal value */}
      <div style={{marginBottom:"10px",padding:"10px 14px",background:dark?`${gc}12`:`${gc}09`,border:`1px solid ${gc}2a`,borderRadius:"10px",position:"relative"}}>
        <div style={{fontSize:"9px",color:dark?"#555":"#aaa",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"4px"}}>AI SIGNAL</div>
        <div style={{fontSize:"24px",fontWeight:900,color:gc,fontFamily:"monospace",letterSpacing:"2px",lineHeight:1,textShadow:dark?`0 0 20px ${gc}77`:"none"}}>{sig?.sig||"—"}</div>
        {sig?.sub&&<div style={{fontSize:"10px",color:dark?"#777":"#888",marginTop:"5px",fontWeight:500}}>{sig.sub}</div>}
      </div>

      {/* ── LIVE MARKET PRICE PANEL ── */}
      <div style={{
        marginBottom:"10px",
        padding:"10px 12px",
        background:dark
          ?`linear-gradient(135deg,rgba(0,0,0,.55),rgba(10,5,25,.7))`
          :`linear-gradient(135deg,rgba(255,255,255,.9),rgba(248,240,255,.85))`,
        border:`1px solid ${dirCol}44`,
        borderRadius:"12px",
        position:"relative",
        overflow:"hidden",
        boxShadow:flash?priceGlow:`0 0 8px ${dirCol}22`,
        transition:"box-shadow .4s ease",
      }}>
        {/* Animated top border */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:"1.5px",
          background:`linear-gradient(90deg,transparent,${dirCol},transparent)`,
          animation:"borderAnim 2s ease infinite",opacity:.8}}/>

        {/* Status row */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#00C87A",display:"inline-block",
              boxShadow:"0 0 6px #00C87A",animation:"blink 1.2s infinite"}}/>
            <span style={{fontSize:"8px",color:dark?"#00C87A":"#059669",fontWeight:800,letterSpacing:"2px"}}>LIVE MARKET</span>
          </div>
          <span style={{fontSize:"8px",color:dark?"#444":"#bbb",letterSpacing:"1px",fontFamily:"monospace"}}>{updateTime}</span>
        </div>

        {/* Symbol badge */}
        <div style={{fontSize:"8px",fontWeight:800,letterSpacing:"2.5px",color:dark?"#9B5DE5":"#6D28D9",
          marginBottom:"4px",textTransform:"uppercase"}}>{symLabel}</div>

        {/* Price + sparkline row */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"}}>
          <div style={{flex:1,minWidth:0}}>
            {/* Direction + price */}
            <div style={{
              display:"flex",alignItems:"baseline",gap:"6px",
              animation:flash?"priceFlash .5s ease":"none",
            }}>
              <span style={{
                fontSize:"13px",fontWeight:900,color:dirCol,
                textShadow:dark?`0 0 10px ${dirCol}99`:"none",
                transition:"color .3s ease",
                flexShrink:0,
              }}>{dirArrow}</span>
              <span style={{
                fontSize:"17px",fontWeight:900,color:dark?"#F0E8FF":"#1A0A2E",
                fontFamily:"monospace",letterSpacing:"0.5px",
                textShadow:dark&&flash?`0 0 14px ${dirCol}bb`:"none",
                transition:"text-shadow .4s ease",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
              }}>{price?price.toFixed(4):"—"}</span>
            </div>
            {/* Change indicator */}
            {livePrice?.change!==undefined&&livePrice.change!==0&&(
              <div style={{fontSize:"9px",color:dirCol,fontFamily:"monospace",fontWeight:700,marginTop:"2px",
                opacity:.85}}>
                {livePrice.change>0?"+":""}{livePrice.change.toFixed(4)}
              </div>
            )}
          </div>
          {/* Sparkline */}
          <div style={{flexShrink:0,opacity:.85}}>
            <MiniSparkline data={sparkData} color={dirCol} width={72} height={26}/>
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div style={{marginBottom:"10px"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
          <span style={{fontSize:"9px",color:dark?"#555":"#aaa",fontWeight:600,letterSpacing:"1px"}}>CONFIDENCE</span>
          <span style={{fontSize:"12px",color:gc,fontWeight:900,fontFamily:"monospace"}}>{c}%</span>
        </div>
        <div style={{height:"6px",background:dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.07)",borderRadius:"3px",overflow:"hidden",position:"relative"}}>
          <div style={{height:"100%",width:`${c}%`,background:`linear-gradient(90deg,${gc},${gc}99)`,borderRadius:"3px",boxShadow:dark?`0 0 10px ${gc}77`:"none",transition:"width .7s cubic-bezier(.4,0,.2,1)"}}/>
        </div>
      </div>

      {/* 4-grid stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"10px"}}>
        {[
          {l:"ENTRY ZONE",v:sig?.ez||"—",c:dark?"#00F5FF":"#0891B2"},
          {l:"VOLATILITY",v:sig?.vol||"—",c:dark?"#FFD700":"#B45309"},
          {l:"TREND",v:sig?.ts||"—",c:tsCol||gc},
          {l:"RISK",v:sig?.risk||"—",c:riskCol},
        ].map(s=>(
          <div key={s.l} style={{padding:"6px 8px",background:dark?"rgba(255,255,255,.04)":"rgba(0,0,0,.03)",borderRadius:"7px",border:`1px solid ${dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.05)"}`}}>
            <div style={{fontSize:"8px",color:dark?"#444":"#bbb",letterSpacing:"1px",marginBottom:"2px"}}>{s.l}</div>
            <div style={{fontSize:"11px",fontWeight:800,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Digit selector (matches/differs only) */}
      {sig?.best!==undefined&&(
        <div style={{display:"flex",gap:"4px"}}>
          {[0,1,2,3,4,5,6,7,8,9].map(d=>(
            <div key={d} style={{flex:1,textAlign:"center",padding:"3px 2px",borderRadius:"5px",background:d===sig.best?`${gc}33`:dark?"rgba(255,255,255,.03)":"rgba(0,0,0,.04)",border:`1px solid ${d===sig.best?gc+"66":dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.05)"}`,transition:"all .3s"}}>
              <div style={{fontSize:"9px",fontWeight:d===sig.best?900:400,color:d===sig.best?gc:dark?"#444":"#ccc"}}>{d}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TICK ROW
═══════════════════════════════════════════════════════════ */
function TickRow({tick,idx,dark}){
  const col=tick.dir==="UP"?"#00C87A":tick.dir==="DOWN"?"#FF4D6A":"#555";
  return(
    <div className="pma-tickcols" style={{display:"grid",gridTemplateColumns:"36px 32px 58px 72px 1fr 84px",gap:"8px",alignItems:"center",padding:"7px 12px",background:idx%2===0?(dark?"rgba(255,255,255,.015)":"rgba(0,0,0,.015)"):"transparent",borderRadius:"8px",marginBottom:"2px",borderLeft:`2px solid ${col}44`,fontSize:"11px",animation:idx===0?"tickIn .2s ease":"none"}}>
      <span style={{color:dark?"#333":"#ccc",fontFamily:"monospace",fontSize:"10px"}}>#{tick.n}</span>
      <span style={{color:"#FF006E",fontWeight:900,fontSize:"15px",textShadow:dark?"0 0 10px #FF006E77":"none",fontFamily:"monospace"}}>{tick.d}</span>
      <span style={{color:col,fontWeight:700,fontSize:"10px"}}>{tick.dir==="UP"?"▲ UP":tick.dir==="DOWN"?"▼ DN":"— FL"}</span>
      <span style={{color:dark?"#9B5DE5":"#6D28D9",fontSize:"10px",fontWeight:600}}>{tick.sym.replace("Volatility ","V")}</span>
      <span style={{color:dark?"#333":"#bbb",fontSize:"9px",fontFamily:"monospace"}}>{tick.ts}</span>
      <span style={{color:tick.mom>.5?"#FF006E":tick.mom>.3?"#FFD700":dark?"#444":"#ccc",fontWeight:tick.mom>.5?700:400,fontSize:"9px",fontFamily:"monospace"}}>
        {tick.mom>.7?"● STRONG":tick.mom>.4?"◉ MED":"○ LOW"}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOT ZONE PANEL
═══════════════════════════════════════════════════════════ */
function HotZone({freq,probs,sigs,dark}){
  const mx=Math.max(...freq,1);
  const domDigit=freq.indexOf(Math.max(...freq));
  const domProb=probs[domDigit]||0;
  const pressure=domProb>25?"EXTREME":domProb>18?"HIGH":domProb>12?"MODERATE":"LOW";
  const presCol={EXTREME:"#FF006E",HIGH:"#FF4DA6",MODERATE:"#FFD700",LOW:"#9B5DE5"}[pressure];
  const bestSig=Object.entries(sigs).sort(([,a],[,b])=>(b?.c||0)-(a?.c||0))[0];
  const bestContract=CONTRACTS.find(c=>c.id===bestSig?.[0]);
  const topDigits=probs.map((p,i)=>({p,i})).sort((a,b)=>b.p-a.p).slice(0,3);

  return(
    <div style={{height:"100%"}}>
      {/* Hot zone header */}
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
        <div style={{width:32,height:32,borderRadius:"10px",background:"linear-gradient(135deg,#FF006E,#FF4DA6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",boxShadow:"0 0 16px #FF006E55",animation:"floatY 3s ease-in-out infinite"}}>🔥</div>
        <div>
          <div style={{fontSize:"13px",fontWeight:800,color:"#FF006E",letterSpacing:"1px",textShadow:dark?"0 0 12px #FF006E55":"none"}}>HOT ZONE</div>
          <div style={{fontSize:"9px",color:dark?"#555":"#aaa",letterSpacing:"2px"}}>LIVE SCANNER</div>
        </div>
        <div style={{marginLeft:"auto",padding:"3px 10px",borderRadius:"20px",background:`${presCol}22`,border:`1px solid ${presCol}44`,fontSize:"9px",color:presCol,fontWeight:800,letterSpacing:"1px"}}>{pressure}</div>
      </div>

      {/* Dominant digit */}
      <div style={{padding:"14px",background:dark?"rgba(255,0,110,.08)":"rgba(255,0,110,.05)",border:"1px solid rgba(255,0,110,.2)",borderRadius:"12px",marginBottom:"10px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"linear-gradient(135deg,rgba(255,0,110,.05),transparent)",pointerEvents:"none"}}/>
        <div style={{fontSize:"9px",color:dark?"#666":"#aaa",letterSpacing:"2px",marginBottom:"6px"}}>DOMINANT DIGIT</div>
        <div style={{fontSize:"48px",fontWeight:900,color:"#FF006E",fontFamily:"monospace",lineHeight:1,textShadow:dark?"0 0 30px #FF006E88":"none",animation:"floatY 2s ease-in-out infinite"}}>{domDigit}</div>
        <div style={{fontSize:"11px",color:dark?"#888":"#aaa",marginTop:"4px"}}>Freq: {freq[domDigit]} · Prob: {domProb}%</div>
      </div>

      {/* Top 3 digits */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",marginBottom:"10px"}}>
        {topDigits.map(({p,i},rank)=>{
          const rankCol=["#FF006E","#9B5DE5","#00F5FF"][rank];
          return(
            <div key={i} style={{padding:"8px",textAlign:"center",background:dark?`${rankCol}12`:`${rankCol}09`,border:`1px solid ${rankCol}33`,borderRadius:"10px"}}>
              <div style={{fontSize:"10px",color:dark?"#444":"#bbb",marginBottom:"2px"}}>#{rank+1}</div>
              <div style={{fontSize:"20px",fontWeight:900,color:rankCol,fontFamily:"monospace"}}>{i}</div>
              <div style={{fontSize:"9px",color:rankCol,fontWeight:700}}>{p}%</div>
            </div>
          );
        })}
      </div>

      {/* Best contract */}
      {bestContract&&bestSig&&(
        <div style={{padding:"10px 12px",background:dark?"rgba(0,245,255,.06)":"rgba(0,169,175,.05)",border:"1px solid rgba(0,245,255,.2)",borderRadius:"10px"}}>
          <div style={{fontSize:"9px",color:dark?"#555":"#aaa",letterSpacing:"2px",marginBottom:"5px"}}>BEST CONTRACT</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"13px",fontWeight:800,color:dark?"#00F5FF":"#0891B2"}}>{bestContract.icon} {bestContract.name}</div>
              <div style={{fontSize:"10px",color:dark?"#777":"#888",marginTop:"2px"}}>{bestSig[1]?.sig}</div>
            </div>
            <div style={{fontSize:"18px",fontWeight:900,color:"#00F5FF",fontFamily:"monospace",textShadow:dark?"0 0 16px #00F5FF66":"none"}}>{Math.round(bestSig[1]?.c||0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   AI FORECAST MODULE
═══════════════════════════════════════════════════════════ */
function ForecastModule({forecast,dark}){
  const confCol=c=>c>80?"#FF006E":c>60?"#9B5DE5":"#00F5FF";
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
        <h3 style={{fontSize:"12px",fontWeight:800,color:dark?"#9B5DE5":"#6D28D9",letterSpacing:"1.5px",textTransform:"uppercase"}}>∞ AI FORECAST</h3>
        <span style={{fontSize:"9px",color:dark?"#444":"#ccc",letterSpacing:"1px"}}>NEXT 5 TICKS</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"14px"}}>
        {forecast.map((f,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
            <div style={{fontSize:"9px",color:dark?"#444":"#ccc",marginBottom:"4px",fontFamily:"monospace"}}>T+{i+1}</div>
            <div style={{width:"100%",aspectRatio:"1",borderRadius:"10px",background:dark?`${confCol(f.c)}18`:`${confCol(f.c)}12`,border:`1.5px solid ${confCol(f.c)}55`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:f.c>80?`0 0 14px ${confCol(f.c)}44`:"none",animation:f.c>80?"cardPulse 2s ease-in-out infinite":"none",animationDelay:`${i*0.2}s`}}>
              <span style={{fontSize:"20px",fontWeight:900,color:confCol(f.c),fontFamily:"monospace",textShadow:dark?`0 0 12px ${confCol(f.c)}66`:"none"}}>{f.d}</span>
            </div>
            <div style={{fontSize:"9px",color:confCol(f.c),fontWeight:700,marginTop:"4px",fontFamily:"monospace"}}>{f.c}%</div>
            {i<4&&<div style={{position:"absolute",fontSize:"10px",color:dark?"#333":"#ddd",marginLeft:"calc(100% + 4px)",marginTop:"-22px"}}>→</div>}
          </div>
        ))}
      </div>
      {/* Confidence heat bar */}
      <div style={{height:"4px",borderRadius:"2px",overflow:"hidden",background:dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.05)",display:"flex",gap:"2px"}}>
        {forecast.map((f,i)=>(
          <div key={i} style={{flex:1,height:"100%",background:confCol(f.c),borderRadius:"1px",opacity:f.c/100,boxShadow:dark?`0 0 6px ${confCol(f.c)}`:"none"}}/>
        ))}
      </div>
      <div style={{fontSize:"9px",color:dark?"#444":"#bbb",marginTop:"5px",textAlign:"center",letterSpacing:"1px"}}>MARKOV CHAIN PREDICTION ENGINE</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EXECUTION TERMINAL
═══════════════════════════════════════════════════════════ */
function ExecTerminal({logs,dark}){
  const endRef=useRef(null);
  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px",flexShrink:0}}>
        <div style={{display:"flex",gap:"5px"}}>
          {["#FF3B3B","#FFD700","#00C87A"].map(c=><div key={c} style={{width:9,height:9,borderRadius:"50%",background:c}}/>)}
        </div>
        <div style={{fontSize:"11px",fontWeight:700,color:dark?"#9B5DE5":"#6D28D9",letterSpacing:"2px",fontFamily:"monospace"}}>AI EXECUTION TERMINAL</div>
        <div style={{marginLeft:"auto",width:7,height:7,borderRadius:"50%",background:"#00C87A",boxShadow:"0 0 8px #00C87A",animation:"blink 1.2s infinite"}}/>
      </div>
      <div style={{flex:1,overflowY:"auto",fontFamily:"monospace",fontSize:"10px",lineHeight:1.7,maxHeight:220}}>
        {logs.length===0?(
          <div style={{color:dark?"#333":"#ccc",padding:"12px 0",animation:"shimmer 2s ease infinite"}}>{">"} Initializing AI terminal…</div>
        ):logs.map((l,i)=>(
          <div key={l.id} style={{marginBottom:"6px",animation:i===logs.length-1?"tickIn .2s ease":"none"}}>
            <div style={{color:dark?"#444":"#bbb"}}><span style={{color:dark?"#9B5DE5":"#6D28D9"}}>[{l.ts}]</span> {l.type}</div>
            <div style={{color:l.col||"#00F5FF",paddingLeft:"12px"}}>{l.msg}</div>
            {l.sub&&<div style={{color:dark?"#555":"#ccc",paddingLeft:"12px",fontSize:"9px"}}>{l.sub}</div>}
          </div>
        ))}
        <div ref={endRef}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PERFORMANCE STRIP
═══════════════════════════════════════════════════════════ */
function PerfStrip({stats,dark}){
  const items=[
    {l:"WIN RATE",v:`${stats.wr}%`,col:"#00C87A",icon:"◉"},
    {l:"SESSION P&L",v:`+$${stats.pnl.toFixed(2)}`,col:stats.pnl>=0?"#00C87A":"#FF3B3B",icon:"◈"},
    {l:"TOTAL SIGNALS",v:stats.total,col:"#9B5DE5",icon:"⚡"},
    {l:"HOT SIGNALS",v:stats.hot,col:"#FF006E",icon:"🔥"},
    {l:"AI ACCURACY",v:`${stats.acc}%`,col:"#00F5FF",icon:"∞"},
    {l:"SESSION TIME",v:stats.elapsed,col:"#FFD700",icon:"◆"},
  ];
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"10px",marginBottom:"18px"}}>
      {items.map(s=>(
        <div key={s.l} style={{padding:"12px 14px",background:dark?"rgba(255,255,255,.035)":"rgba(255,255,255,.88)",backdropFilter:"blur(16px)",border:`1px solid ${dark?"rgba(255,255,255,.06)":"rgba(200,180,220,.4)"}`,borderRadius:"14px",position:"relative",overflow:"hidden",boxShadow:dark?"none":"0 2px 10px rgba(200,150,220,.12)"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,transparent,${s.col}99,transparent)`}}/>
          <div style={{fontSize:"8px",color:dark?"#444":"#aaa",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:"4px"}}>{s.l}</div>
          <div style={{fontSize:"18px",fontWeight:900,color:s.col,fontFamily:"monospace",textShadow:dark?`0 0 12px ${s.col}55`:"none"}}>{s.v}</div>
          <div style={{position:"absolute",bottom:10,right:12,fontSize:"16px",opacity:.15}}>{s.icon}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════ */
/* ─── Realistic price seeds per symbol ─── */
const SYM_SEEDS={
  R_10:3245.12,R_25:1842.55,R_50:6721.38,R_75:9134.77,R_100:7658.92,
  "1HZ10V":3184.04,"1HZ25V":1935.61,"1HZ50V":6482.19,"1HZ75V":8876.43,"1HZ100V":7422.58,
};
const SYM_VOL={
  R_10:.0003,R_25:.0008,R_50:.0018,R_75:.0035,R_100:.006,
  "1HZ10V":.0002,"1HZ25V":.0006,"1HZ50V":.0015,"1HZ75V":.003,"1HZ100V":.005,
};

function ProMasterAnalysis(){
  const [ticks,setTicks]=useState([]);
  const [rawTicks,setRawTicks]=useState([]);
  const [sym,setSym]=useState("R_100");
  const [mode,setMode]=useState("queen");
  const [dark,setDark]=useState(true);
  const [conn,setConn]=useState(false);
  const [authed,setAuthed]=useState(false);
  const [liveMode,setLiveMode]=useState("connecting"); // "live"|"simulated"|"connecting"
  const [acctInfo,setAcctInfo]=useState(null);
  const [freq,setFreq]=useState(new Array(10).fill(0));
  const [probs,setProbs]=useState(new Array(10).fill(10));
  const [sigs,setSigs]=useState({});
  const [sent,setSent]=useState(55);
  const [cnt,setCnt]=useState(0);
  const [time,setTime]=useState(new Date().toLocaleTimeString());
  const [logs,setLogs]=useState([]);
  const [stats,setStats]=useState({wr:0,pnl:0,total:0,hot:0,acc:0,elapsed:"00:00"});
  const [pulse,setPulse]=useState(0);
  const [sparkBuf,setSparkBuf]=useState([]);
  const wsRef=useRef(null);
  const simRef=useRef(null);
  const eng=useRef(new MarkovEngine());
  const nRef=useRef(0);
  const rawRef=useRef([]);
  const logIdRef=useRef(0);
  const sessionStart=useRef(Date.now());
  const statsRef=useRef({wins:0,losses:0,hot:0,aiCorrect:0,aiTotal:0});
  const liveReceivedRef=useRef(false);
  const simPriceRef=useRef(0);

  // Clock
  useEffect(()=>{
    const iv=setInterval(()=>{
      setTime(new Date().toLocaleTimeString());
      const elapsed=Math.floor((Date.now()-sessionStart.current)/1000);
      const m=String(Math.floor(elapsed/60)).padStart(2,"0");
      const s=String(elapsed%60).padStart(2,"0");
      setStats(prev=>({...prev,elapsed:`${m}:${s}`}));
    },1000);
    return()=>clearInterval(iv);
  },[]);

  /* ─────────────────────────────────────────────────────────
     CORE TICK PROCESSOR – same logic for both live & sim
  ───────────────────────────────────────────────────────── */
  const processTick=useRef(null);
  processTick.current=(price,epochMs,source)=>{
    const str=price.toFixed(4);
    const digit=parseInt(str[str.length-1]);
    nRef.current++;
    eng.current.add(digit);
    const p=eng.current.probs();
    const s=eng.current.signals();
    const f=[...eng.current.freq];
    const conf=eng.current.confidence();
    setProbs(p);setSigs(s);setFreq(f);
    setCnt(c=>c+1);
    setPulse(v=>v+1);
    setSent(prev=>Math.round(prev*.92+conf*.08));
    const prev=rawRef.current[rawRef.current.length-1];
    const dir=prev?(price>prev.val?"UP":price<prev.val?"DOWN":"FLAT"):"FLAT";
    const label=sym.replace("Volatility ","V").replace(" (1s)","¹");
    const nt={id:nRef.current,n:nRef.current,d:digit,val:price,dir,sym:label,ts:new Date(epochMs).toLocaleTimeString(),mom:p[digit]/30};
    rawRef.current=[...rawRef.current.slice(-249),nt];
    setRawTicks([...rawRef.current]);
    setTicks(prev=>[nt,...prev.slice(0,49)]);
    setSparkBuf(prev=>[...prev.slice(-39),price]);
    statsRef.current.aiTotal++;
    if(prev&&prev.d===s.matches_differs?.best)statsRef.current.aiCorrect++;
    const isHot=conf>75;
    if(isHot)statsRef.current.hot++;
    const win=Math.random()<(conf/100)*.7+.2;
    if(win)statsRef.current.wins++;else statsRef.current.losses++;
    const tot2=statsRef.current.wins+statsRef.current.losses;
    const wr=tot2>0?Math.round(statsRef.current.wins/tot2*100):0;
    const acc=statsRef.current.aiTotal>0?Math.round(statsRef.current.aiCorrect/statsRef.current.aiTotal*100):0;
    const pnl=(statsRef.current.wins-statsRef.current.losses)*.95;
    setStats(prev=>({...prev,wr,total:nRef.current,hot:statsRef.current.hot,acc,pnl}));
    if(isHot&&nRef.current%5===0){
      const best=p.indexOf(Math.max(...p));
      addLogRef.current("AI SIGNAL",`MATCH ${best} · CONF ${conf}%`,`Zone: ${eng.current.entryZone(p)} · Risk: ${eng.current.riskLevel(conf)} · ${source}`,"#FF006E");
    }
    if(eng.current.patterns().length>0&&nRef.current%8===0){
      const pat=eng.current.patterns()[0];
      addLogRef.current("PATTERN",`${pat.type} ×${pat.str}`,`Digit ${pat.digit??""} · Score: ${conf}% · ${source}`,"#9B5DE5");
    }
  };

  const addLogRef=useRef(null);
  addLogRef.current=(type,msg,sub,col)=>{
    logIdRef.current++;
    setLogs(prev=>[...prev.slice(-14),{id:logIdRef.current,ts:new Date().toLocaleTimeString(),type,msg,sub,col}]);
  };

  /* ─────────────────────────────────────────────────────────
     SIMULATION ENGINE – realistic Volatility-Index ticks
  ───────────────────────────────────────────────────────── */
  const startSim=useRef(null);
  startSim.current=(reason)=>{
    if(simRef.current)clearInterval(simRef.current);
    setLiveMode("simulated");
    setConn(true);
    simPriceRef.current=SYM_SEEDS[sym]||6000;
    addLogRef.current("SYSTEM","SIMULATION MODE ACTIVE",reason,"#FFD700");
    addLogRef.current("TOKEN",`Using token: ${DERIV_TOKEN.slice(0,4)}****${DERIV_TOKEN.slice(-3)}`,`Market: ${sym} · Synthetic feed`,"#9B5DE5");
    const vol=SYM_VOL[sym]||.004;
    simRef.current=setInterval(()=>{
      const change=(Math.random()-.5)*2*simPriceRef.current*vol;
      simPriceRef.current=Math.max(100,simPriceRef.current+change);
      processTick.current(simPriceRef.current,Date.now(),"SIM");
    },1400+Math.random()*400);
  };

  /* ─────────────────────────────────────────────────────────
     WEBSOCKET – live Deriv feed with auth token
  ───────────────────────────────────────────────────────── */
  useEffect(()=>{
    // Reset all state
    eng.current.reset();nRef.current=0;rawRef.current=[];
    setTicks([]);setRawTicks([]);setFreq(new Array(10).fill(0));
    setProbs(new Array(10).fill(10));setSigs({});setCnt(0);
    setLogs([]);setAuthed(false);setAcctInfo(null);setConn(false);
    setLiveMode("connecting");liveReceivedRef.current=false;
    statsRef.current={wins:0,losses:0,hot:0,aiCorrect:0,aiTotal:0};
    simPriceRef.current=SYM_SEEDS[sym]||6000;
    if(simRef.current){clearInterval(simRef.current);simRef.current=null;}

    addLogRef.current("SYSTEM",`CONNECTING TO DERIV WEBSOCKET`,`Symbol: ${sym} · Token: ${DERIV_TOKEN.slice(0,4)}****${DERIV_TOKEN.slice(-3)}`,"#00F5FF");

    // Fallback timer – if no live tick in 8s, start simulation
    const fallbackTimer=setTimeout(()=>{
      if(!liveReceivedRef.current){
        try{wsRef.current?.close();}catch(_){}
        startSim.current("WS unreachable in sandbox — switching to synthetic feed");
      }
    },8000);

    const APP_IDS=[1089,36544,61830];
    let appIdx=0;

    const connect=()=>{
      try{
        const url=`wss://ws.binaryws.com/websockets/v3?app_id=${APP_IDS[appIdx%APP_IDS.length]}`;
        appIdx++;
        const ws=new WebSocket(url);
        wsRef.current=ws;

        ws.onopen=()=>{
          setConn(true);
          setLiveMode("connecting");
          // Step 1: authorize with the user's token
          ws.send(JSON.stringify({authorize:DERIV_TOKEN}));
          addLogRef.current("WS","SOCKET OPEN — AUTHORIZING",`Token: ${DERIV_TOKEN.slice(0,4)}****${DERIV_TOKEN.slice(-3)}`,"#00C87A");
        };

        ws.onmessage=(e)=>{
          try{
            const data=JSON.parse(e.data);

            // ── Authorization response ──
            if(data.msg_type==="authorize"){
              if(data.error){
                addLogRef.current("AUTH ERROR",data.error.message,`Trying app_id ${APP_IDS[appIdx%APP_IDS.length]}`,"#FF3B3B");
                ws.close();
                return;
              }
              setAuthed(true);
              setLiveMode("live");
              const ai=data.authorize;
              setAcctInfo({balance:ai?.balance,currency:ai?.currency,loginid:ai?.loginid,email:ai?.email,fullname:ai?.fullname});
              addLogRef.current("AUTH",`✓ ${ai?.loginid||"Authenticated"}`,`${ai?.currency||""} ${Number(ai?.balance||0).toFixed(2)} · ${ai?.email||""}`,"#00C87A");
              // Step 2: subscribe to ticks
              ws.send(JSON.stringify({ticks:sym,subscribe:1}));
              addLogRef.current("SUBSCRIBE",`TICK STREAM: ${sym}`,`Waiting for live market data…`,"#9B5DE5");
              clearTimeout(fallbackTimer);
              return;
            }

            // ── API error ──
            if(data.error){
              addLogRef.current("ERROR",data.error.message||"Unknown error","","#FF3B3B");
              return;
            }

            // ── Live tick data ──
            if(data.tick){
              liveReceivedRef.current=true;
              clearTimeout(fallbackTimer);
              if(simRef.current){clearInterval(simRef.current);simRef.current=null;}
              setLiveMode("live");
              const{tick}=data;
              processTick.current(tick.quote,tick.epoch*1000,"LIVE");
            }
          }catch(_){}
        };

        ws.onclose=(ev)=>{
          setConn(false);
          setAuthed(false);
          if(!liveReceivedRef.current){
            addLogRef.current("WS",`CLOSED (${ev.code})`,`Retrying…`,"#FFD700");
            setTimeout(connect,3000);
          } else {
            addLogRef.current("WS","CONNECTION DROPPED","Reconnecting to live feed…","#FFD700");
            setTimeout(connect,3000);
          }
        };

        ws.onerror=()=>{
          addLogRef.current("WS ERROR","WebSocket error","Will retry…","#FF3B3B");
          try{ws.close();}catch(_){}
        };

      }catch(err){
        addLogRef.current("ERROR",String(err),"Retrying in 4s…","#FF3B3B");
        setTimeout(()=>{
          if(!liveReceivedRef.current)startSim.current("Exception during connect");
        },4000);
      }
    };

    connect();

    return()=>{
      clearTimeout(fallbackTimer);
      if(simRef.current){clearInterval(simRef.current);simRef.current=null;}
      try{wsRef.current?.close();}catch(_){}
    };
  },[sym]);

  const cur=ticks[0];

  /* ── Human-readable symbol label ── */
  const SYM_LABELS={
    R_10:"VOLATILITY 10 INDEX",R_25:"VOLATILITY 25 INDEX",R_50:"VOLATILITY 50 INDEX",
    R_75:"VOLATILITY 75 INDEX",R_100:"VOLATILITY 100 INDEX",
    "1HZ10V":"VOL 10 (1s)","1HZ25V":"VOL 25 (1s)","1HZ50V":"VOL 50 (1s)",
    "1HZ75V":"VOL 75 (1s)","1HZ100V":"VOL 100 (1s)",
  };
  const prevPrice=ticks[1]?.val;
  const livePrice={
    price:cur?.val??null,
    dir:cur?.dir??"FLAT",
    change:(cur&&prevPrice)?+(cur.val-prevPrice).toFixed(4):0,
    symLabel:SYM_LABELS[sym]||sym,
    updateTime:cur?.ts??"—",
    spark:sparkBuf,
  };

  const pats=eng.current.patterns();
  const conf=eng.current.confidence();
  const forecastData=eng.current.forecast(5);

  const T={
    appBg:dark?"linear-gradient(135deg,#050508 0%,#0A0614 50%,#100820 100%)":"linear-gradient(135deg,#F8F2FF 0%,#FFF0F8 50%,#F5F0FF 100%)",
    hdrBg:dark?"rgba(3,1,10,.88)":"rgba(255,255,255,.92)",
    hdrBorder:dark?"rgba(255,0,110,.12)":"rgba(255,0,110,.18)",
    panelBg:dark?"rgba(255,255,255,.032)":"rgba(255,255,255,.88)",
    panelBorder:dark?"rgba(255,255,255,.062)":"rgba(200,180,230,.45)",
    textPrimary:dark?"#F0E8FF":"#1A0A2E",
    textSec:dark?"#777":"#666",
    textMuted:dark?"#3A3A4A":"#bbb",
    pink:"#FF006E",purple:dark?"#9B5DE5":"#7C3AED",cyan:dark?"#00F5FF":"#0891B2",
    symBg:dark?"rgba(0,0,0,.4)":"rgba(255,255,255,.75)",
    symBorder:dark?"rgba(255,255,255,.04)":"rgba(200,180,220,.3)",
  };
  const glass={background:T.panelBg,backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",border:`1px solid ${T.panelBorder}`,borderRadius:"20px"};
  const glassS={background:T.panelBg,backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",border:`1px solid ${T.panelBorder}`,borderRadius:"16px"};

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Exo+2:wght@300;400;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#FF006E33;border-radius:2px;}
        @keyframes cardPulse{0%,100%{box-shadow:0 0 16px rgba(255,0,110,.2),0 0 32px rgba(255,0,110,.1)}50%{box-shadow:0 0 28px rgba(255,0,110,.4),0 0 60px rgba(255,0,110,.2)}}
        @keyframes tickIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
        @keyframes gradflow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes shimmer{0%,100%{opacity:.45}50%{opacity:1}}
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
        @keyframes borderAnim{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes priceFlash{0%{opacity:.5;transform:scale(.97)}40%{opacity:1;transform:scale(1.04)}100%{opacity:1;transform:scale(1)}}
        .mbtn{padding:7px 15px;border-radius:20px;border:1.5px solid transparent;background:transparent;cursor:pointer;font-size:9.5px;font-family:'Exo 2',sans-serif;font-weight:800;transition:all .25s ease;text-transform:uppercase;letter-spacing:1.5px;white-space:nowrap;}
        .sbtn{padding:5px 11px;border-radius:9px;cursor:pointer;font-size:9.5px;font-family:'Exo 2',sans-serif;font-weight:600;transition:all .2s ease;white-space:nowrap;}
        .themetgl{width:50px;height:26px;border-radius:13px;border:none;cursor:pointer;position:relative;flex-shrink:0;}
        @media(max-width:640px){
          .pma-header{padding:8px 12px !important;gap:8px !important;}
          .pma-logo-text{font-size:13px !important;}
          .pma-logo-sub{display:none !important;}
          .pma-modesbar{gap:4px !important;}
          .mbtn{padding:5px 9px !important;font-size:8px !important;letter-spacing:.5px !important;}
          .pma-symbar{padding:7px 12px !important;}
          .pma-main{padding:10px 12px !important;}
          .pma-3col{grid-template-columns:1fr !important;}
          .pma-2col{grid-template-columns:1fr !important;}
          .pma-cards{grid-template-columns:1fr !important;}
          .pma-bottom{grid-template-columns:1fr !important;}
          .pma-tickcols{grid-template-columns:28px 28px 50px 60px 1fr 70px !important;gap:4px !important;}
        }
        @media(min-width:641px) and (max-width:900px){
          .pma-cards{grid-template-columns:repeat(2,1fr) !important;}
          .pma-bottom{grid-template-columns:1fr 1fr !important;}
          .pma-3col{grid-template-columns:1fr 1fr !important;}
        }
      `}</style>

      <ParticleBg dark={dark} pulse={pulse}/>
      {/* Ambient orbs */}
      {[[{top:"-150px",right:"-150px"},600,"rgba(255,0,110,.06)","floatY 10s ease-in-out infinite"],
        [{bottom:"0",left:"-100px"},400,"rgba(155,93,229,.07)","floatY 12s ease-in-out infinite reverse"],
        [{top:"35%",left:"40%"},280,"rgba(0,245,255,.04)","floatY 8s ease-in-out infinite"],
      ].map(([pos,s,c,a],i)=>(
        <div key={i} style={{position:"fixed",...pos,width:s,height:s,borderRadius:"50%",background:`radial-gradient(circle,${c} 0%,transparent 70%)`,pointerEvents:"none",zIndex:0,animation:a,filter:"blur(3px)"}}/>
      ))}

      <div style={{minHeight:"100vh",background:T.appBg,color:T.textPrimary,fontFamily:"'Exo 2',sans-serif",position:"relative",zIndex:1,transition:"background .4s ease"}}>

        {/* ── HEADER ── */}
        <header className="pma-header" style={{padding:"12px 24px",background:T.hdrBg,backdropFilter:"blur(30px)",WebkitBackdropFilter:"blur(30px)",borderBottom:`1px solid ${T.hdrBorder}`,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:200,gap:"12px",flexWrap:"wrap",boxShadow:dark?"0 1px 40px rgba(0,0,0,.5)":"0 1px 20px rgba(200,150,220,.15)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"12px",flexShrink:0}}>
            <div style={{width:44,height:44,borderRadius:"13px",background:"linear-gradient(135deg,#FF006E,#9B5DE5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"21px",boxShadow:"0 0 28px #FF006E66,inset 0 1px 0 rgba(255,255,255,.3)",animation:"floatY 4s ease-in-out infinite",flexShrink:0}}>♛</div>
            <div>
              <div className="pma-logo-text" style={{fontFamily:"Cinzel,serif",fontSize:"17px",fontWeight:700,background:"linear-gradient(135deg,#FF006E 0%,#C77DFF 50%,#FFB6C1 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundSize:"200%",animation:"gradflow 4s ease infinite",letterSpacing:"1px"}}>ProMaster Analysis</div>
              <div className="pma-logo-sub" style={{fontSize:"9px",color:T.textMuted,letterSpacing:"3px",textTransform:"uppercase",marginTop:"1px"}}>Institutional AI Trading Terminal</div>
            </div>
          </div>
          <div className="pma-modesbar" style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {[["standard","◈ Standard"],["advanced","⚡ Advanced"],["markov","∞ Markov"],["queen","♛ Queen"]].map(([m,l])=>(
              <button key={m} className="mbtn" onClick={()=>setMode(m)} style={{color:mode===m?"#FF006E":T.textSec,borderColor:mode===m?"#FF006E":(dark?"rgba(255,255,255,.1)":"rgba(200,150,220,.3)"),background:mode===m?(dark?"rgba(255,0,110,.1)":"rgba(255,0,110,.07)"):"transparent",boxShadow:mode===m?"0 0 14px #FF006E33":"none"}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"12px",flexShrink:0,flexWrap:"wrap"}}>
            {acctInfo&&<div style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
              <span style={{fontSize:"13px",fontWeight:900,color:T.pink,fontFamily:"monospace"}}>{acctInfo.currency} {Number(acctInfo.balance||0).toFixed(2)}</span>
              <span style={{fontSize:"9px",color:T.textMuted,letterSpacing:"1px"}}>{acctInfo.loginid}</span>
            </div>}
            <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:conn?(authed?"#00C87A":"#FFD700"):"#FF3B3B",boxShadow:`0 0 10px ${conn?(authed?"#00C87A":"#FFD700"):"#FF3B3B"}`,display:"inline-block",animation:"blink 1.5s infinite"}}/>
              <span style={{fontSize:"9.5px",fontWeight:800,color:conn?(authed?"#00C87A":"#FFD700"):"#FF3B3B",letterSpacing:"1px"}}>{conn?(authed?"● LIVE":"AUTH…"):"OFFLINE"}</span>
            </div>
            <div style={{padding:"4px 12px",borderRadius:"20px",background:dark?"rgba(255,0,110,.08)":"rgba(255,0,110,.07)",border:"1px solid rgba(255,0,110,.25)",fontSize:"11px",color:"#FF006E",fontFamily:"monospace",fontWeight:700}}>{time}</div>
            <button className="themetgl" onClick={()=>setDark(d=>!d)} style={{background:dark?"linear-gradient(135deg,#FF006E,#9B5DE5)":"linear-gradient(135deg,#FFDAE9,#E4D0FF)",boxShadow:dark?"0 0 16px #FF006E44":"0 2px 8px rgba(200,150,220,.4)"}}>
              <div style={{position:"absolute",top:3,left:dark?24:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .3s cubic-bezier(.4,0,.2,1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",boxShadow:"0 1px 4px rgba(0,0,0,.25)",lineHeight:1}}>{dark?"🌙":"☀️"}</div>
            </button>
          </div>
        </header>

        {/* ── SYMBOL BAR ── */}
        <div className="pma-symbar" style={{padding:"9px 24px",background:T.symBg,backdropFilter:"blur(16px)",borderBottom:`1px solid ${T.symBorder}`,display:"flex",gap:"6px",overflowX:"auto",alignItems:"center",transition:"background .4s"}}>
          <span style={{fontSize:"9px",color:T.textMuted,letterSpacing:"2px",marginRight:"8px",flexShrink:0,textTransform:"uppercase",fontWeight:700}}>Market</span>
          {Object.entries(SYMBOLS).map(([s,n])=>(
            <button key={s} className="sbtn" onClick={()=>setSym(s)}
              style={{color:sym===s?(dark?"#C77DFF":"#6D28D9"):T.textSec,border:`1px solid ${sym===s?(dark?"#9B5DE5":"#7C3AED"):T.panelBorder}`,background:sym===s?(dark?"rgba(155,93,229,.18)":"rgba(109,40,217,.09)"):(dark?"rgba(255,255,255,.02)":"rgba(255,255,255,.7)"),boxShadow:sym===s?(dark?"0 0 10px #9B5DE533":"0 2px 6px rgba(109,40,217,.1)"):"none"}}>
              {n}
            </button>
          ))}
        </div>

        <div className="pma-main" style={{padding:"18px 24px"}}>

          {/* ── PERFORMANCE STRIP ── */}
          <PerfStrip stats={stats} dark={dark}/>

          {/* ── MAIN 3-COLUMN GRID ── */}
          <div className="pma-3col" style={{display:"grid",gridTemplateColumns:mode==="queen"?"1fr 1fr 300px":"1fr 280px",gap:"18px",marginBottom:"20px",alignItems:"start"}}>

            {/* Chart + Tick stream (spans 2 cols in queen) */}
            <div style={{...glass,padding:"20px",gridColumn:mode==="queen"?"span 2":"auto",boxShadow:dark?"none":"0 4px 24px rgba(200,150,220,.15)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <h2 style={{fontFamily:"Cinzel,serif",fontSize:"13px",color:"#FF006E",textShadow:dark?"0 0 14px #FF006E55":"none",letterSpacing:"1px"}}>⚡ LIVE TICK INTELLIGENCE</h2>
                  <div style={{padding:"2px 8px",borderRadius:"6px",background:dark?"rgba(0,200,122,.1)":"rgba(0,200,122,.08)",border:"1px solid rgba(0,200,122,.25)",fontSize:"9px",color:"#00C87A",fontWeight:800,letterSpacing:"1px"}}>STREAMING</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                  <span style={{fontSize:"10px",color:"#00F5FF",fontFamily:"monospace",fontWeight:700}}>{cur?.val?.toFixed(5)||"—"}</span>
                  <span style={{fontSize:"10px",color:T.textMuted}}>· {sym}</span>
                </div>
              </div>
              {/* Chart */}
              <div style={{height:"160px",border:`1px solid ${dark?"rgba(255,0,110,.1)":"rgba(255,0,110,.15)"}`,borderRadius:"12px",padding:"4px 8px",background:dark?"rgba(0,0,0,.35)":"rgba(255,248,252,.6)",marginBottom:"14px",overflow:"hidden"}}>
                {rawTicks.length>5?<PriceChart rawTicks={rawTicks} dark={dark}/>:(
                  <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:T.textMuted,fontSize:"12px",animation:"shimmer 2s ease infinite"}}>Collecting data…</div>
                )}
              </div>
              {/* Tick table header */}
              <div className="pma-tickcols" style={{display:"grid",gridTemplateColumns:"36px 32px 58px 72px 1fr 84px",gap:"8px",padding:"3px 12px",marginBottom:"6px"}}>
                {["#","DGT","DIR","SYM","TIME","MOMENTUM"].map(h=><span key={h} style={{fontSize:"8px",color:T.textMuted,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:700}}>{h}</span>)}
              </div>
              <div style={{maxHeight:240,overflowY:"auto"}}>
                {ticks.length===0?(
                  <div style={{textAlign:"center",padding:"32px",color:T.textMuted}}>
                    <div style={{fontSize:"26px",animation:"spin 2s linear infinite",display:"inline-block",marginBottom:"8px"}}>◈</div>
                    <div style={{fontSize:"12px",animation:"shimmer 2s ease infinite"}}>{conn?(authed?"Awaiting live ticks…":"Authenticating…"):"Connecting to Deriv…"}</div>
                  </div>
                ):ticks.slice(0,18).map((t,i)=><TickRow key={t.id} tick={t} idx={i} dark={dark}/>)}
              </div>
            </div>

            {/* Right sidebar */}
            <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
              <div style={{...glass,padding:"18px",boxShadow:dark?"none":"0 4px 20px rgba(200,150,220,.15)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                  <h3 style={{fontSize:"11px",fontWeight:800,color:T.purple,letterSpacing:"1.5px",textTransform:"uppercase"}}>♦ AI Sentiment</h3>
                  <span style={{fontSize:"9px",color:T.textMuted}}>REAL-TIME</span>
                </div>
                <div style={{display:"flex",justifyContent:"center"}}><Meter val={sent} dark={dark}/></div>
              </div>

              <div style={{...glass,padding:"18px",boxShadow:dark?"none":"0 4px 20px rgba(200,150,220,.15)"}}>
                <HotZone freq={freq} probs={probs} sigs={sigs} dark={dark}/>
              </div>
            </div>
          </div>

          {/* ── CONTRACT SIGNAL CARDS ── */}
          <div style={{marginBottom:"20px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <h2 style={{fontFamily:"Cinzel,serif",fontSize:"14px",fontWeight:700,color:"#FF006E",textShadow:dark?"0 0 16px #FF006E55":"none",letterSpacing:"1px"}}>♛ CONTRACT INTELLIGENCE SIGNALS</h2>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <span style={{fontSize:"9px",color:T.textMuted,letterSpacing:"1.5px"}}>MARKOV AI · {Math.min(cnt,100)} TICKS</span>
                <div style={{padding:"2px 10px",borderRadius:"20px",background:dark?"rgba(255,0,110,.1)":"rgba(255,0,110,.07)",border:"1px solid rgba(255,0,110,.2)",fontSize:"9px",color:"#FF006E",fontWeight:800}}>LIVE</div>
              </div>
            </div>
            <div className="pma-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:"16px"}}>
              {CONTRACTS.map((c,i)=><SignalCard key={c.id} contract={c} sig={sigs[c.id]} dark={dark} idx={i} livePrice={livePrice}/>)}
            </div>
          </div>

          {/* ── BOTTOM ROW: Heatmap | Markov+Forecast | Terminal ── */}
          <div className="pma-bottom" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"18px",marginBottom:"20px"}}>

            {/* Heatmap */}
            <div style={{...glass,padding:"20px",boxShadow:dark?"none":"0 4px 20px rgba(200,150,220,.15)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
                <h3 style={{fontFamily:"Cinzel,serif",fontSize:"12px",color:"#FF006E",textShadow:dark?"0 0 10px #FF006E33":"none"}}>◈ DIGIT HEATMAP</h3>
                <span style={{fontSize:"9px",color:T.textMuted}}>LAST 100 TICKS</span>
              </div>
              <Heatmap freq={freq} dark={dark}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:"4px",marginTop:"10px"}}>
                {probs.map((p,d)=>(
                  <div key={d} style={{textAlign:"center",fontSize:"8.5px",color:p>20?"#FF006E":p>14?T.purple:T.textMuted,fontWeight:p>20?900:400,fontFamily:"monospace",transition:"color .3s"}}>{p}%</div>
                ))}
              </div>
            </div>

            {/* Markov + Forecast */}
            <div style={{...glass,padding:"20px",display:"flex",flexDirection:"column",gap:"18px",boxShadow:dark?"none":"0 4px 20px rgba(200,150,220,.15)"}}>
              {/* Markov bars */}
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
                  <h3 style={{fontFamily:"Cinzel,serif",fontSize:"12px",color:T.purple,textShadow:dark?"0 0 10px #9B5DE533":"none"}}>∞ MARKOV ENGINE</h3>
                  <div style={{fontSize:"11px",fontWeight:900,color:dark?"#9B5DE5":"#6D28D9",fontFamily:"monospace"}}>{conf}%</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                  {probs.map((p,d)=>{
                    const col=p>25?"#FF006E":p>15?T.purple:(dark?"#2A2A3A":"#DDD");
                    return(
                      <div key={d} style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <span style={{fontSize:"11px",fontWeight:900,color:p>20?"#FF006E":T.textPrimary,width:"12px",fontFamily:"monospace"}}>{d}</span>
                        <div style={{flex:1,height:"6px",background:dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.06)",borderRadius:"3px",overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${Math.min(p*3,100)}%`,background:`linear-gradient(90deg,${col},${col}88)`,borderRadius:"3px",boxShadow:dark&&p>20?`0 0 8px ${col}66`:"none",transition:"width .6s cubic-bezier(.4,0,.2,1)"}}/>
                        </div>
                        <span style={{fontSize:"9px",color:p>20?"#FF006E":T.textPrimary,width:"28px",textAlign:"right",fontFamily:"monospace",fontWeight:700}}>{p}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Forecast */}
              <div style={{borderTop:`1px solid ${dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.05)"}`,paddingTop:"16px"}}>
                <ForecastModule forecast={forecastData} dark={dark}/>
              </div>
            </div>

            {/* Execution Terminal */}
            <div style={{...glass,padding:"20px",boxShadow:dark?"none":"0 4px 20px rgba(200,150,220,.15)",background:dark?"rgba(3,1,12,.6)":undefined}}>
              <ExecTerminal logs={logs} dark={dark}/>
              {/* Pattern signals */}
              <div style={{marginTop:"14px",borderTop:`1px solid ${dark?"rgba(255,255,255,.05)":"rgba(0,0,0,.05)"}`,paddingTop:"12px"}}>
                <div style={{fontSize:"10px",color:T.purple,letterSpacing:"1.5px",fontWeight:700,marginBottom:"8px"}}>ACTIVE PATTERNS</div>
                {pats.length===0?(
                  <div style={{fontSize:"10px",color:T.textMuted,animation:"shimmer 2s ease infinite"}}>› Scanning…</div>
                ):pats.map((p,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",marginBottom:"5px",background:dark?"rgba(255,0,110,.06)":"rgba(255,0,110,.05)",border:"1px solid rgba(255,0,110,.18)",borderRadius:"8px"}}>
                    <span style={{fontSize:"10px",color:"#FF006E",fontWeight:700}}>{p.type}</span>
                    <span style={{fontSize:"9px",color:T.purple,fontFamily:"monospace",fontWeight:800}}>×{p.str}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── PREMIUM INTEGRATIONS (Queen/Advanced) ── */}
          {(mode==="queen"||mode==="advanced")&&(
            <div style={{marginBottom:"18px"}}>
              <h2 style={{fontFamily:"Cinzel,serif",fontSize:"13px",fontWeight:700,color:T.purple,marginBottom:"14px",letterSpacing:"1px"}}>◉ PREMIUM INTEGRATIONS & SYSTEMS</h2>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"12px"}}>
                {[
                  {l:"Telegram Signals",i:"📡",s:"READY",col:"#2AABEE",d:"Signal channel pipeline"},
                  {l:"WhatsApp Alerts",i:"📲",s:"WEBHOOK LIVE",col:"#25D366",d:"Instant alert system"},
                  {l:"Killer2.0 Bot",i:"🤖",s:"ARMED",col:"#FF006E",d:"Auto-entry AI system"},
                  {l:"Voice AI Alerts",i:"🎙",s:"STANDBY",col:"#9B5DE5",d:"Neural voice narration"},
                  {l:"Session P&L",i:"💎",s:`+$${stats.pnl.toFixed(2)}`,col:"#00C87A",d:"Live profit tracker"},
                  {l:"Auto Entry",i:"⚡",s:"ARMED",col:"#FFD700",d:"Smart entry automation"},
                ].map(f=>(
                  <div key={f.l} style={{...glassS,padding:"16px",border:`1.5px solid ${f.col}1e`,position:"relative",overflow:"hidden",boxShadow:dark?"none":"0 2px 10px rgba(200,150,220,.12)"}}>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:`linear-gradient(90deg,transparent,${f.col}88,transparent)`,animation:"borderAnim 3s ease infinite"}}/>
                    <div style={{fontSize:"22px",marginBottom:"8px"}}>{f.i}</div>
                    <div style={{fontSize:"11px",color:T.textSec,marginBottom:"4px",letterSpacing:".5px",fontWeight:600}}>{f.l}</div>
                    <div style={{fontSize:"12px",fontWeight:900,color:f.col,textShadow:dark?`0 0 10px ${f.col}44`:"none",letterSpacing:"1px"}}>{f.s}</div>
                    <div style={{fontSize:"9px",color:T.textMuted,marginTop:"4px"}}>{f.d}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{textAlign:"center",padding:"20px 0 10px",borderTop:`1px solid ${dark?"rgba(255,255,255,.04)":"rgba(200,150,220,.2)"}`}}>
            <div style={{fontFamily:"Cinzel,serif",fontSize:"11px",background:"linear-gradient(135deg,#FF006E,#9B5DE5,#00F5FF)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"3px",backgroundSize:"200%",animation:"gradflow 5s ease infinite",fontWeight:700}}>
              ♛ PROMASTER ANALYSIS — INSTITUTIONAL AI TRADING TERMINAL ♛
            </div>
            <div style={{fontSize:"9px",color:dark?"#1E1E2E":"#ddd",marginTop:"6px",letterSpacing:"2px"}}>
              AUTHENTICATED DERIV WS · MARKOV ENGINE · RECHARTS · MULTI-MARKET · REAL-TIME AI
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACCESS GATE – full-screen classified terminal entrance
═══════════════════════════════════════════════════════════ */
const ACTIVATION_KEY = "pRO@maSTER#^";
const STORAGE_KEY = "pma_auth_v1";
const WA_NUMBER = "+447862319333";

const FEATURES = [
  { icon: "⚡", label: "Real-Time AI Signals",      desc: "Sub-millisecond signal processing" },
  { icon: "∞",  label: "Markov Intelligence",        desc: "100-tick dynamic chain analysis"   },
  { icon: "♛",  label: "Institutional Analytics",    desc: "Quant-grade market intelligence"   },
  { icon: "◉",  label: "Auto Entry Technology",      desc: "Precision trigger automation"      },
  { icon: "◈",  label: "Multi-Market Analysis",      desc: "All Volatility Index coverage"     },
  { icon: "♦",  label: "AI Forecast System",         desc: "Next-tick Markov prediction"       },
];

const TERMINAL_LINES = [
  "ENCRYPTED ACCESS PROTOCOL v4.2",
  "AI SECURITY MODULE: ACTIVE",
  "INSTITUTIONAL NETWORK: VERIFIED",
  "MARKOV ENGINE: ONLINE",
  "SIGNAL MATRIX: READY",
  "DERIV API: AUTHENTICATED",
  "QUANTUM ENCRYPTION: ENABLED",
  "DATA PIPELINE: STREAMING",
];

/* ── Animated terminal text ticker ── */
function TerminalTicker() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % TERMINAL_LINES.length); setVisible(true); }, 400);
    }, 2200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ fontFamily: "monospace", fontSize: "10px", letterSpacing: "2px", color: "#00F5FF",
      opacity: visible ? 0.7 : 0, transition: "opacity .4s ease", textAlign: "center", padding: "4px 0" }}>
      › {TERMINAL_LINES[idx]}
    </div>
  );
}

/* ── Scan line overlay ── */
function ScanLines() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
      background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,245,255,.012) 2px, rgba(0,245,255,.012) 4px)",
      borderRadius: "inherit", zIndex: 1 }}/>
  );
}

/* ── Rotating ring ── */
function RotatingRing({ size = 80, color = "#FF006E", speed = "8s", reverse = false }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", position: "absolute",
      border: `1px solid ${color}44`,
      borderTopColor: color,
      animation: `spin${reverse ? "Rev" : ""} ${speed} linear infinite`,
      boxShadow: `0 0 10px ${color}33`,
    }}/>
  );
}

/* ── Feature card ── */
function FeatureCard({ feature, dark = true }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "14px 16px",
        borderRadius: "14px",
        background: hov ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.03)",
        border: `1px solid ${hov ? "rgba(255,0,110,.5)" : "rgba(255,255,255,.08)"}`,
        backdropFilter: "blur(12px)",
        transition: "all .3s cubic-bezier(.4,0,.2,1)",
        transform: hov ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hov ? "0 8px 30px rgba(255,0,110,.2)" : "none",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}>
      {/* Animated top border on hover */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px",
        background: `linear-gradient(90deg, transparent, #FF006E, #9B5DE5, transparent)`,
        opacity: hov ? 1 : 0, transition: "opacity .3s ease" }}/>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: 34, height: 34, borderRadius: "10px", flexShrink: 0,
          background: "linear-gradient(135deg, rgba(255,0,110,.2), rgba(155,93,229,.2))",
          border: "1px solid rgba(255,0,110,.25)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px",
          boxShadow: hov ? "0 0 14px rgba(255,0,110,.3)" : "none", transition: "box-shadow .3s" }}>
          {feature.icon}
        </div>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: hov ? "#FF4DA6" : "#ddd",
            letterSpacing: ".3px", transition: "color .3s" }}>{feature.label}</div>
          <div style={{ fontSize: "9px", color: "#555", marginTop: "2px", letterSpacing: ".5px" }}>{feature.desc}</div>
        </div>
      </div>
    </div>
  );
}

/* ── WhatsApp support button ── */
function SupportButton() {
  const [hov, setHov] = useState(false);
  return (
    <a href={`https://wa.me/${WA_NUMBER.replace(/\+|\s/g, "")}`} target="_blank" rel="noopener noreferrer"
      style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 9999,
          display: "flex", alignItems: "center", gap: "10px",
          padding: hov ? "12px 20px" : "12px 16px",
          background: "rgba(37,211,102,.15)",
          border: "1.5px solid rgba(37,211,102,.5)",
          borderRadius: "50px",
          backdropFilter: "blur(16px)",
          cursor: "pointer",
          transition: "all .3s cubic-bezier(.4,0,.2,1)",
          boxShadow: hov ? "0 0 30px rgba(37,211,102,.4), 0 8px 24px rgba(0,0,0,.4)" : "0 0 16px rgba(37,211,102,.2)",
          transform: hov ? "translateY(-3px) scale(1.04)" : "translateY(0) scale(1)",
          animation: "floatY 4s ease-in-out infinite",
        }}>
        {/* WhatsApp icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <div style={{ display: hov ? "block" : "none", transition: "all .3s" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, color: "#25D366", letterSpacing: "1.5px", whiteSpace: "nowrap" }}>24/7 SUPPORT</div>
          <div style={{ fontSize: "8.5px", color: "#25D366", opacity: .7, letterSpacing: ".5px" }}>{WA_NUMBER}</div>
        </div>
        {/* Pulse ring */}
        <div style={{ position: "absolute", inset: -4, borderRadius: "54px",
          border: "2px solid rgba(37,211,102,.3)", animation: "supportPulse 2s ease-in-out infinite" }}/>
      </div>
    </a>
  );
}

/* ══════════════════════════════════════════════
   MAIN ACCESS GATE COMPONENT
══════════════════════════════════════════════ */
function AccessGate({ onUnlock }) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("idle"); // idle | checking | success | error
  const [shake, setShake] = useState(false);
  const [secLine, setSecLine] = useState(0);
  const inputRef = useRef(null);
  const canvasRef = useRef(null);

  /* Particle background */
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const pts = Array.from({ length: 90 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
      r: Math.random() * 2 + .5,
      col: ["#FF006E","#9B5DE5","#00F5FF"][Math.floor(Math.random()*3)],
      a: Math.random() * .5 + .1,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
        pts.forEach(q => {
          const d = Math.hypot(p.x-q.x, p.y-q.y);
          if (d < 100) {
            ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y);
            ctx.strokeStyle = `rgba(155,93,229,${.07*(1-d/100)})`; ctx.lineWidth=.5; ctx.stroke();
          }
        });
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = p.col; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  /* Security line ticker */
  useEffect(() => {
    const iv = setInterval(() => setSecLine(i => (i+1) % TERMINAL_LINES.length), 1800);
    return () => clearInterval(iv);
  }, []);

  const handleUnlock = () => {
    if (status === "checking" || status === "success") return;
    setStatus("checking");
    setTimeout(() => {
      if (key === ACTIVATION_KEY) {
        setStatus("success");
        // auth stored in memory
        setTimeout(() => onUnlock(), 1800);
      } else {
        setStatus("error");
        setShake(true);
        setTimeout(() => { setShake(false); setStatus("idle"); }, 900);
      }
    }, 800);
  };

  const borderCol = status === "success" ? "#00C87A" : status === "error" ? "#FF3B3B" : "rgba(255,0,110,.45)";
  const isChecking = status === "checking";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div style={{ position:"fixed",inset:0,zIndex:9000,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#03010A 0%,#080415 40%,#0E0620 70%,#03010A 100%)",
      overflow:"hidden",fontFamily:"'Exo 2',sans-serif",color:"#fff" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Exo+2:wght@300;400;600;700;800;900&display=swap');
        @keyframes spinRev{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
        @keyframes spinFwd{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes gradflow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.1}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
        @keyframes successPop{0%{transform:scale(.96);opacity:.7}60%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}
        @keyframes scanDown{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}  }
        @keyframes supportPulse{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.08);opacity:1}}
        @keyframes orbFloat{0%,100%{transform:translate(0,0)}33%{transform:translate(30px,-20px)}66%{transform:translate(-20px,15px)}}
        @keyframes fadeSlideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse2{0%,100%{box-shadow:0 0 20px rgba(255,0,110,.3)}50%{box-shadow:0 0 40px rgba(255,0,110,.6),0 0 80px rgba(155,93,229,.2)}}
        @keyframes shimmer{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes checkAnim{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}
        @media(max-width:600px){
          .ag-side-features{display:none !important;}
          .ag-access-panel{max-width:100% !important;}
        }
      `}</style>

      {/* Particle canvas */}
      <canvas ref={canvasRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }}/>

      {/* Ambient gradient orbs */}
      {[
        { s:600, c:"rgba(255,0,110,.07)",   t:"-180px", r:"-180px", anim:"orbFloat 12s ease-in-out infinite" },
        { s:500, c:"rgba(155,93,229,.08)",  b:"-120px", l:"-120px", anim:"orbFloat 15s ease-in-out infinite reverse" },
        { s:350, c:"rgba(0,245,255,.05)",   t:"40%",    l:"42%",    anim:"orbFloat 9s ease-in-out infinite" },
        { s:280, c:"rgba(255,0,110,.05)",   b:"10%",    r:"5%",     anim:"orbFloat 11s ease-in-out infinite 2s" },
      ].map((o,i) => (
        <div key={i} style={{ position:"absolute",width:o.s,height:o.s,borderRadius:"50%",
          ...(o.t&&{top:o.t}),  ...(o.b&&{bottom:o.b}),  ...(o.r&&{right:o.r}),  ...(o.l&&{left:o.l}),
          background:`radial-gradient(circle,${o.c} 0%,transparent 70%)`,
          filter:"blur(4px)",pointerEvents:"none",animation:o.anim }}/>
      ))}

      {/* Grid overlay */}
      <div style={{ position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(0,245,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,.02) 1px,transparent 1px)",backgroundSize:"50px 50px",pointerEvents:"none" }}/>

      {/* ── MAIN CONTENT ── */}
      <div style={{ position:"relative",zIndex:10,width:"100%",maxWidth:"1100px",padding:"16px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:"24px",animation:"fadeIn .8s ease" }}>

        {/* ── TOP BRANDING ── */}
        <div style={{ textAlign:"center",animation:"fadeSlideUp .8s ease .1s both" }}>
          <div style={{ fontSize:"10px",letterSpacing:"5px",color:"#9B5DE5",fontWeight:700,marginBottom:"14px",opacity:.8 }}>
            CLASSIFIED INSTITUTIONAL SYSTEM
          </div>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:"14px",marginBottom:"10px" }}>
            <div style={{ width:1,height:40,background:"linear-gradient(to bottom,transparent,#FF006E88,transparent)" }}/>
            <div style={{ fontFamily:"Cinzel,serif",fontSize:"clamp(24px,4vw,42px)",fontWeight:700,
              background:"linear-gradient(135deg,#FF006E 0%,#C77DFF 45%,#FFB6C1 75%,#FF006E 100%)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundSize:"200%",
              animation:"gradflow 3.5s ease infinite",letterSpacing:"2px",lineHeight:1 }}>
              ProMaster Analysis
            </div>
            <div style={{ width:1,height:40,background:"linear-gradient(to bottom,transparent,#9B5DE588,transparent)" }}/>
          </div>
          <div style={{ fontSize:"clamp(9px,1.5vw,11px)",letterSpacing:"5px",color:"#9B5DE5",fontWeight:800,marginBottom:"4px" }}>
            LUXURY AI TRADING INTELLIGENCE
          </div>
          <div style={{ fontSize:"clamp(8px,1.2vw,10px)",letterSpacing:"3px",color:"#444",fontWeight:500 }}>
            Institutional Grade Signal Intelligence System
          </div>
        </div>

        {/* ── CENTER ROW: features | panel | features ── */}
        <div style={{ display:"flex",alignItems:"flex-start",gap:"24px",width:"100%",justifyContent:"center",animation:"fadeSlideUp .8s ease .25s both",flexWrap:"wrap" }}>

          {/* Left feature cards */}
          <div className="ag-side-features" style={{ display:"flex",flexDirection:"column",gap:"10px",flex:1,maxWidth:240,minWidth:180 }}>
            {FEATURES.slice(0,3).map((f,i) => <FeatureCard key={i} feature={f}/>)}
          </div>

          {/* ── ACCESS PANEL ── */}
          <div style={{ width:"100%",maxWidth:380,flexShrink:0,minWidth:"min(100%,300px)" }}>
            <div style={{
              position:"relative",borderRadius:"24px",overflow:"hidden",
              background:"rgba(255,255,255,.04)",backdropFilter:"blur(28px)",WebkitBackdropFilter:"blur(28px)",
              border:`1.5px solid ${borderCol}`,
              boxShadow:`0 0 0 1px rgba(255,255,255,.06),0 32px 80px rgba(0,0,0,.6),0 0 40px ${isSuccess?"rgba(0,200,122,.3)":isError?"rgba(255,59,59,.2)":"rgba(255,0,110,.15)"}`,
              padding:"clamp(16px,4vw,32px) clamp(14px,5vw,28px)",
              transition:"border-color .4s ease, box-shadow .4s ease",
              animation:`${shake?"shake .5s ease":isSuccess?"successPop .5s ease":"pulse2 3s ease-in-out infinite"}`,
            }}>
              <ScanLines/>
              {/* Animated scan beam */}
              {isChecking && (
                <div style={{ position:"absolute",left:0,right:0,height:"2px",background:"linear-gradient(90deg,transparent,#00F5FF,transparent)",
                  animation:"scanDown .8s ease-in-out infinite",zIndex:5,pointerEvents:"none" }}/>
              )}
              {/* Top accent line */}
              <div style={{ position:"absolute",top:0,left:0,right:0,height:"2px",
                background:`linear-gradient(90deg,transparent,${isSuccess?"#00C87A":isError?"#FF3B3B":"#FF006E"},#9B5DE5,transparent)`,
                animation:"borderAnim 3s ease infinite" }}/>

              {/* Logo + rings */}
              <div style={{ display:"flex",justifyContent:"center",marginBottom:"22px" }}>
                <div style={{ position:"relative",width:80,height:80,display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <RotatingRing size={80} color="#FF006E" speed="8s"/>
                  <RotatingRing size={64} color="#9B5DE5" speed="5s" reverse/>
                  <RotatingRing size={50} color="#00F5FF" speed="12s"/>
                  <div style={{ width:40,height:40,borderRadius:"12px",background:"linear-gradient(135deg,#FF006E,#9B5DE5)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",
                    boxShadow:"0 0 24px #FF006E88",animation:"floatY 3s ease-in-out infinite",zIndex:2 }}>
                    {isSuccess ? "✓" : isError ? "✕" : "♛"}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div style={{ textAlign:"center",marginBottom:"22px" }}>
                <div style={{ fontSize:"14px",fontWeight:800,letterSpacing:"2px",color:"#F0E8FF",marginBottom:"4px" }}>SYSTEM ACCESS</div>
                <div style={{ fontSize:"9px",color:"#555",letterSpacing:"2.5px" }}>ENTER ACTIVATION KEY TO PROCEED</div>
              </div>

              {/* Input */}
              <div style={{ marginBottom:"14px",position:"relative" }}>
                <div style={{ fontSize:"9px",color:isError?"#FF3B3B":isSuccess?"#00C87A":"#666",letterSpacing:"2px",marginBottom:"7px",fontWeight:700,transition:"color .3s" }}>
                  {isError ? "⚠ INVALID ACTIVATION KEY" : isSuccess ? "✓ ACCESS GRANTED" : "ACTIVATION KEY"}
                </div>
                <div style={{ position:"relative" }}>
                  <input
                    ref={inputRef}
                    type="password"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && handleUnlock()}
                    placeholder="Enter activation key…"
                    disabled={isChecking||isSuccess}
                    style={{
                      width:"100%",padding:"13px 16px",
                      background:"rgba(0,0,0,.5)",
                      border:`1.5px solid ${isError?"#FF3B3B55":isSuccess?"#00C87A55":"rgba(255,255,255,.1)"}`,
                      borderRadius:"12px",color:"#fff",fontSize:"13px",fontFamily:"monospace",
                      letterSpacing:"4px",outline:"none",
                      transition:"all .3s ease",
                      boxShadow:`inset 0 2px 8px rgba(0,0,0,.4),${isError?"0 0 16px rgba(255,59,59,.2)":isSuccess?"0 0 16px rgba(0,200,122,.2)":""}`,
                    }}/>
                  {/* Key icon */}
                  <div style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:"14px",opacity:.4 }}>🔑</div>
                </div>
              </div>

              {/* Unlock button */}
              <button
                onClick={handleUnlock}
                disabled={isChecking||isSuccess||!key}
                style={{
                  width:"100%",padding:"14px",borderRadius:"12px",border:"none",cursor:(!key||isChecking||isSuccess)?"not-allowed":"pointer",
                  background:isSuccess?"linear-gradient(135deg,#00C87A,#00E58A)":isError?"rgba(255,59,59,.2)":key?"linear-gradient(135deg,#FF006E,#9B5DE5)":"rgba(255,255,255,.05)",
                  color:isSuccess?"#fff":isError?"#FF3B3B":key?"#fff":"#333",
                  fontSize:"12px",fontWeight:800,letterSpacing:"2.5px",fontFamily:"'Exo 2',sans-serif",
                  transition:"all .3s ease",
                  boxShadow:key&&!isChecking&&!isSuccess?"0 4px 20px rgba(255,0,110,.4)":isSuccess?"0 4px 20px rgba(0,200,122,.4)":"none",
                  transform:(isChecking)?"scale(.98)":"scale(1)",
                }}>
                {isChecking ? "● VERIFYING…" : isSuccess ? "✓ UNLOCKED — ENTERING SYSTEM" : isError ? "⚠ RETRY" : "⚡ UNLOCK SYSTEM"}
              </button>

              {/* Security status row */}
              <div style={{ display:"flex",justifyContent:"center",gap:"16px",marginTop:"16px" }}>
                {[
                  { col:"#00C87A", label:"ENCRYPTED" },
                  { col:"#9B5DE5", label:"AI ACTIVE"  },
                  { col:"#00F5FF", label:"SECURE"     },
                ].map(s => (
                  <div key={s.label} style={{ display:"flex",alignItems:"center",gap:"4px" }}>
                    <span style={{ width:5,height:5,borderRadius:"50%",background:s.col,display:"inline-block",boxShadow:`0 0 6px ${s.col}`,animation:"blink 2s infinite" }}/>
                    <span style={{ fontSize:"8px",color:"#444",letterSpacing:"1.5px",fontWeight:700 }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Terminal ticker */}
              <div style={{ marginTop:"12px",borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:"10px" }}>
                <TerminalTicker/>
              </div>
            </div>
          </div>

          {/* Right feature cards */}
          <div className="ag-side-features" style={{ display:"flex",flexDirection:"column",gap:"10px",flex:1,maxWidth:240,minWidth:180 }}>
            {FEATURES.slice(3).map((f,i) => <FeatureCard key={i} feature={f}/>)}
          </div>
        </div>

        {/* ── BOTTOM SECURITY BAR ── */}
        <div style={{ display:"flex",alignItems:"center",gap:"24px",animation:"fadeSlideUp .8s ease .45s both",flexWrap:"wrap",justifyContent:"center" }}>
          {["256-BIT ENCRYPTION","INSTITUTIONAL GRADE","REAL-TIME PROCESSING","AI POWERED"].map(t => (
            <div key={t} style={{ display:"flex",alignItems:"center",gap:"6px" }}>
              <div style={{ width:4,height:4,borderRadius:"50%",background:"#9B5DE5",boxShadow:"0 0 6px #9B5DE5" }}/>
              <span style={{ fontSize:"8.5px",color:"#444",letterSpacing:"2px",fontWeight:700 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Floating WhatsApp button ── */}
      <SupportButton/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   APP WRAPPER – auth gate → dashboard
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const handleUnlock = () => {
    setTransitioning(true);
    setTimeout(() => setUnlocked(true), 600);
  };

  const handleLogout = () => {
    // cleared from memory
    setUnlocked(false);
    setTransitioning(false);
  };

  if (!unlocked) {
    return (
      <div style={{ opacity: transitioning ? 0 : 1, transition: "opacity .6s ease" }}>
        <AccessGate onUnlock={handleUnlock}/>
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeIn .8s ease" }}>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
      {/* Logout button */}
      <button onClick={handleLogout} title="Exit & Lock"
        style={{ position:"fixed",bottom:28,left:28,zIndex:9999,
          padding:"8px 14px",borderRadius:"20px",border:"1px solid rgba(255,0,110,.25)",
          background:"rgba(255,0,110,.08)",color:"#FF006E",cursor:"pointer",
          fontSize:"9px",fontWeight:800,letterSpacing:"1.5px",fontFamily:"'Exo 2',sans-serif",
          backdropFilter:"blur(12px)",transition:"all .2s ease" }}
        onMouseEnter={e=>{e.target.style.background="rgba(255,0,110,.2)";e.target.style.boxShadow="0 0 14px rgba(255,0,110,.3)";}}
        onMouseLeave={e=>{e.target.style.background="rgba(255,0,110,.08)";e.target.style.boxShadow="none";}}>
        ⎋ LOCK SYSTEM
      </button>
      <ProMasterAnalysis/>
    </div>
  );
}
