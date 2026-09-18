
/* =========================================================
   KWH METER - UNIFIED SCRIPT
   WebSocket ESP32 saat ini menggunakan port 81.
   Jika ESP32 memakai /ws pada port yang sama, ubah WS_URL.
========================================================= */

let socket = null;
let reconnectTimer = null;
let lastDataTime = 0;
let reconnecting = false;

/* Jika ESP32 WebSocket server memakai port 81: */
const WS_URL = `ws://${window.location.hostname}:81/`;

/* ---------- helper ---------- */
function $(id){ return document.getElementById(id); }

function formatNumber(value, digits=2){
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : "--";
}

function setText(id,value){
    const el=$(id);
    if(el && value !== undefined && value !== null) el.textContent=value;
}

function setMeter(selector, percent){
    const el=document.querySelector(selector);
    if(el) el.style.width=Math.max(0,Math.min(100,percent))+"%";
}

/* ---------- SIDEBAR ---------- */
function setupSidebar(){
    const sidebar=document.querySelector(".sidebar");
    const menu=document.querySelector(".menu");
    const overlay=$("sidebarOverlay");

    if(!sidebar || !menu || !overlay) return;

    function openMenu(){
        sidebar.classList.add("open");
        overlay.classList.add("show");
        document.body.classList.add("menu-open");
    }

    function closeMenu(){
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
        document.body.classList.remove("menu-open");
    }

    menu.addEventListener("click",()=>{
        sidebar.classList.contains("open") ? closeMenu() : openMenu();
    });

    overlay.addEventListener("click",closeMenu);

    document.querySelectorAll(".nav-item").forEach(item=>{
        item.addEventListener("click",()=>{
            if(window.innerWidth <= 800) closeMenu();
        });
    });

    window.addEventListener("resize",()=>{
        if(window.innerWidth > 800) closeMenu();
    });
}

/* ---------- ACTIVE PAGE ---------- */
function setActivePage(){
    let current=location.pathname.split("/").pop();
    if(!current) current="index.html";

    document.querySelectorAll(".nav-item").forEach(item=>{
        const href=(item.getAttribute("href")||"").split("/").pop();
        item.classList.toggle("active",href===current);
    });
}

/* ---------- CLOCK ---------- */
function updateClock(){
    const now=new Date();
    const dateEl=$("sideDate");
    const timeEl=$("sideTime");

    if(dateEl){
        dateEl.textContent=now.toLocaleDateString("id-ID",{
            day:"2-digit",month:"long",year:"numeric"
        });
    }
    if(timeEl){
        timeEl.textContent=now.toLocaleTimeString("id-ID",{
            hour:"2-digit",minute:"2-digit",second:"2-digit"
        });
    }
}

/* ---------- STATUS ---------- */
function setStatus(online){
    const text=$("connectionStatus");
    const box=$("espStatus");
    const dot=box ? box.querySelector("i") : null;

    if(text) text.textContent=online ? "Online" : "Offline";
    if(text) text.style.color=online ? "var(--green)" : "var(--danger)";
    if(box) box.classList.toggle("offline",!online);
    if(dot){
        dot.classList.toggle("offline",!online);
    }

    document.querySelectorAll("[data-connection]").forEach(el=>{
        el.textContent=online ? "Terhubung" : "Terputus";
        el.classList.toggle("offline",!online);
    });
}

/* ---------- WEBSOCKET ---------- */
function connectWebSocket(){
    if(socket && (socket.readyState===WebSocket.OPEN || socket.readyState===WebSocket.CONNECTING)) return;

    console.log("Menghubungkan WebSocket:",WS_URL);

    try{
        socket=new WebSocket(WS_URL);

        socket.onopen=()=>{
            console.log("ESP32 WebSocket terhubung");
            reconnecting=false;
            lastDataTime=Date.now();
            setStatus(true);
        };

        socket.onmessage=(event)=>{
            try{
                const data=JSON.parse(event.data);
                lastDataTime=Date.now();
                setStatus(true);
                updateDashboard(data);
            }catch(error){
                console.error("JSON WebSocket tidak valid:",error);
            }
        };

        socket.onclose=()=>{
            console.log("ESP32 terputus");
            setStatus(false);
            scheduleReconnect();
        };

        socket.onerror=(error)=>{
            console.error("WebSocket error:",error);
            setStatus(false);
        };
    }catch(error){
        console.error("Gagal membuat WebSocket:",error);
        setStatus(false);
        scheduleReconnect();
    }
}

function scheduleReconnect(){
    if(reconnecting) return;
    reconnecting=true;
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(()=>{
        reconnecting=false;
        connectWebSocket();
    },2000);
}

/* ---------- DATA ---------- */
function updateDashboard(data){
    /* Mendukung dua nama key:
       powerFactor / pf
       activePower / power
    */
    const voltage=data.voltage;
    const current=data.current;
    const pf=data.powerFactor ?? data.pf;
    const power=data.activePower ?? data.power;
    const energy=data.energy;

    setText("voltage",formatNumber(voltage,1));
    setText("current",formatNumber(current,2));
    setText("powerFactor",formatNumber(pf,2));
    setText("activePower",formatNumber(power,1));
    setText("energyTotal",formatNumber(energy,2));

    setText("tVoltage",formatNumber(voltage,1));
    setText("tCurrent",formatNumber(current,2));
    setText("tPf",formatNumber(pf,2));
    setText("tPower",formatNumber(power,1));
    setText("tEnergy",formatNumber(energy,2));

    setText("energy",formatNumber(energy,2));
    setText("energyVoltage",formatNumber(voltage,1)+" V");
    setText("energyCurrent",formatNumber(current,2)+" A");
    setText("energyPower",formatNumber(power,1)+" W");

    /* progress meter */
    if(Number.isFinite(Number(voltage))) setMeter(".voltage .meter span",Number(voltage)/250*100);
    if(Number.isFinite(Number(current))) setMeter(".current .meter span",Number(current)/10*100);
    if(Number.isFinite(Number(pf))) setMeter(".pf .meter span",Number(pf)*100);
    if(Number.isFinite(Number(power))) setMeter(".power .meter span",Number(power)/1000*100);

    updateHistory(data);
}

/* ---------- HISTORY ---------- */
function updateHistory(data){
    const body=$("historyBody");
    if(!body) return;

    if(Array.isArray(data.history)){
        body.innerHTML="";
        data.history.slice().reverse().forEach(row=>{
            const tr=document.createElement("tr");
            const values=[
                row.time ?? "--",
                row.voltage ?? "--",
                row.current ?? "--",
                row.powerFactor ?? row.pf ?? "--",
                row.activePower ?? row.power ?? "--",
                row.energy ?? "--"
            ];
            values.forEach(v=>{
                const td=document.createElement("td");
                td.textContent=v;
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        return;
    }

    /* Kalau ESP hanya mengirim satu data, tambahkan sebagai baris terbaru. */
    if(body.dataset.liveRows==="true"){
        const tr=document.createElement("tr");
        [
            new Date().toLocaleTimeString("id-ID"),
            formatNumber(data.voltage,1),
            formatNumber(data.current,2),
            formatNumber(data.powerFactor ?? data.pf,2),
            formatNumber(data.activePower ?? data.power,1),
            formatNumber(data.energy,2)
        ].forEach(v=>{
            const td=document.createElement("td");
            td.textContent=v;
            tr.appendChild(td);
        });
        body.prepend(tr);
        while(body.children.length>20) body.removeChild(body.lastElementChild);
    }
}

/* ---------- SETTINGS ---------- */
function saveSettings(){
    const name=$("deviceName");
    const interval=$("interval");
    const info=$("saveInfo");

    if(name) localStorage.setItem("deviceName",name.value);
    if(interval) localStorage.setItem("interval",interval.value);

    if(info){
        info.textContent="✓ Tersimpan";
        setTimeout(()=>info.textContent="",2000);
    }
}

function loadSettings(){
    const name=$("deviceName");
    const interval=$("interval");
    if(name) name.value=localStorage.getItem("deviceName") || "KWH METER ESP32";
    if(interval) interval.value=localStorage.getItem("interval") || "1000";
}

/* ---------- CONNECTION WATCHDOG ---------- */
setInterval(()=>{
    if(lastDataTime>0 && Date.now()-lastDataTime>4000){
        setStatus(false);
    }
},1000);

/* ---------- START ---------- */
document.addEventListener("DOMContentLoaded",()=>{
    setupSidebar();
    setActivePage();
    updateClock();
    setInterval(updateClock,1000);
    loadSettings();
    connectWebSocket();
});
