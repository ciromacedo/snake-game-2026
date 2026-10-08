//=============================
// CORRIDA DE MOTOS - pseudo-3D
//
// A pista é uma lista de "segmentos" (pedaços de 200 unidades). Para cada linha
// da tela abaixo do horizonte calculamos qual parte da pista está ali, o quanto
// ela está deslocada pela curva e qual a largura dela em pixels. É o truque dos
// jogos de corrida clássicos: não existe 3D de verdade, só matemática de perspectiva.
//=============================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const LARGURA = 320;
const ALTURA = 180;
canvas.width = LARGURA;
canvas.height = ALTURA;

//=============================
// CONFIGURAÇÕES
//=============================
const HORIZONTE = 76;                 // linha da tela onde fica o horizonte
const COMPRIMENTO_SEG = 200;          // comprimento de cada segmento da pista
const LARGURA_ESTRADA = 900;          // metade da largura da pista (unidades do mundo)
const FAIXAS = 3;
const ALTURA_CAMERA = 1000;
const CAMPO_VISAO = 100;              // graus
const PROFUNDIDADE_CAMERA = 1 / Math.tan((CAMPO_VISAO / 2) * Math.PI / 180);
const Z_JOGADOR = ALTURA_CAMERA * PROFUNDIDADE_CAMERA;    // distância da câmera até a moto
const K_PROJECAO = PROFUNDIDADE_CAMERA * ALTURA_CAMERA * ALTURA / 2;   // z = K / (linha - horizonte)
const DISTANCIA_DESENHO = 200;        // quantos segmentos à frente desenhamos
const ESCALA_CURVA = 0.5;             // quanto a curva "entorta" a pista na tela
const COMPRIMENTO_ZEBRA = 3;          // segmentos por listra da zebra
const BORDA_PISTA = 1 + 1 / 6;        // pista (1) + zebra: depois disso é fora da pista
const ALTURA_MOTO = 690;              // altura da moto no mundo (define o tamanho na tela)
const ALTURA_DESENHO_MOTO = 65;       // altura do desenho da moto (px, na escala 1)

// Física (tempo em segundos)
const PASSO = 1 / 60;
const VEL_MAX = COMPRIMENTO_SEG / PASSO;     // 12000: um segmento por quadro
const ACEL = VEL_MAX / 4;
const FREIO = -VEL_MAX * 0.9;
const DESACEL = -VEL_MAX / 6;
const DESACEL_FORA = -VEL_MAX / 2;
const LIMITE_FORA = VEL_MAX / 4;
const CENTRIFUGA = 0.3;                      // força que empurra a moto para fora nas curvas
const TURBO_MULT = 1.25;

// Dificuldades
const DIFICULDADES = {
    facil:   { nome: 'Fácil',   voltas: 2, tempoInicial: 55, bonusVolta: 25, rivais: 8,  velMin: 0.45, velMax: 0.80 },
    medio:   { nome: 'Médio',   voltas: 3, tempoInicial: 45, bonusVolta: 20, rivais: 10, velMin: 0.55, velMax: 0.92 },
    dificil: { nome: 'Difícil', voltas: 3, tempoInicial: 40, bonusVolta: 17, rivais: 12, velMin: 0.66, velMax: 1.02 }
};

// Pontos extras pela posição final (índice = posição)
const BONUS_POSICAO = [0, 10000, 6000, 4000, 2500, 1500, 1000, 600, 400, 200, 100, 50, 0];

// Cores das motos: [carenagem, jaqueta, capacete]
const PALETA_JOGADOR = ['#e63946', '#f4f4f4', '#ffd23f'];
const PALETAS_RIVAIS = [
    ['#2f6bff', '#ffffff', '#ffd166'],
    ['#ffd23f', '#222222', '#ffffff'],
    ['#2ecc71', '#ffffff', '#222222'],
    ['#9b5de5', '#ffffff', '#f15bb5'],
    ['#ff8c1a', '#222222', '#ffffff'],
    ['#19c3d6', '#ffffff', '#ff4d6d']
];

// Cores da pista (claro / escuro alternam a cada listra; "media" é usada ao longe)
const CORES = {
    claro:  { chao: '#1b21b0', pista: '#7d7d89', zebra: '#ececec', faixa: '#f4f4f4' },
    escuro: { chao: '#161b96', pista: '#72717d', zebra: '#d62839', faixa: null },
    media:  { chao: '#191ea3', pista: '#777683', zebra: '#9c6a78', faixa: null }
};

//============================
// ELEMENTOS DA PÁGINA
//============================
const elPontos = document.getElementById('pontos');
const elRecorde = document.getElementById('recorde');
const elVolta = document.getElementById('volta');
const elPosicao = document.getElementById('posicao');
const selDificuldade = document.getElementById('dificuldade');
const btnSom = document.getElementById('btnSom');

//============================
// UTILITÁRIOS
//============================
function mod(a, b){
    return ((a % b) + b) % b;
}

function limitar(valor, minimo, maximo){
    return Math.max(minimo, Math.min(maximo, valor));
}

// gerador de números aleatórios com semente (a pista e o cenário são sempre iguais)
function criarAleatorio(semente){
    let a = semente;
    return function(){
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

//============================
// PISTA
//============================
let segmentos = [];
let comprimentoPista = 0;
let cenario = [];                   // postes, placas, outdoors...

function adicionarSegmento(curva){
    const i = segmentos.length;
    segmentos.push({
        indice: i,
        curva: curva,
        escuro: Math.floor(i / COMPRIMENTO_ZEBRA) % 2 === 1
    });
}

function suavizarEntrada(a, b, t){
    return a + (b - a) * Math.pow(t, 2);
}

function suavizarEntradaSaida(a, b, t){
    return a + (b - a) * ((-Math.cos(t * Math.PI) / 2) + 0.5);
}

const placasPendentes = [];

function adicionarEstrada(entrada, manter, saida, curva){
    if(Math.abs(curva) >= 3){
        placasPendentes.push({ indice: segmentos.length, curva: curva });
    }
    for(let n = 0; n < entrada; n++){
        adicionarSegmento(suavizarEntrada(0, curva, n / entrada));
    }
    for(let n = 0; n < manter; n++){
        adicionarSegmento(curva);
    }
    for(let n = 0; n < saida; n++){
        adicionarSegmento(suavizarEntradaSaida(curva, 0, n / saida));
    }
}

function adicionarReta(quantidade){
    adicionarEstrada(0, quantidade, 0, 0);
}

function criarPista(){
    segmentos = [];
    placasPendentes.length = 0;

    adicionarReta(50);
    adicionarEstrada(25, 40, 25, 2);
    adicionarReta(30);
    adicionarEstrada(25, 45, 25, -3);
    adicionarEstrada(20, 25, 20, 3);
    adicionarReta(60);
    adicionarEstrada(30, 50, 30, 4);
    adicionarReta(20);
    adicionarEstrada(25, 30, 25, -2);
    adicionarReta(70);
    adicionarEstrada(30, 60, 30, -4);
    adicionarEstrada(20, 20, 20, 2);
    adicionarReta(40);
    adicionarEstrada(25, 40, 25, 3);
    adicionarEstrada(25, 40, 25, -3);
    adicionarReta(60);
    adicionarEstrada(25, 35, 25, 4);
    adicionarReta(30);
    adicionarEstrada(20, 30, 20, -2);
    adicionarReta(80);

    // a pista tem que ter um número de segmentos múltiplo de 2 zebras (senão a listra "pula" na emenda)
    while(segmentos.length % (COMPRIMENTO_ZEBRA * 2) !== 0){
        adicionarSegmento(0);
    }
    comprimentoPista = segmentos.length * COMPRIMENTO_SEG;
}

function criarCenario(){
    cenario = [];
    const aleatorio = criarAleatorio(2024);
    const total = segmentos.length;

    // postes de luz dos dois lados (alternados)
    for(let i = 6; i < total; i += 14){
        cenario.push({ tipo: 'poste', z: i * COMPRIMENTO_SEG + 100, offset: -1.5, colisao: true });
        cenario.push({ tipo: 'poste', z: (i + 7) * COMPRIMENTO_SEG + 100, offset: 1.5, colisao: true });
    }

    // outdoors mais afastados
    const coresOutdoor = [['#ff3d81', '#ffd23f'], ['#19c3d6', '#ffffff'], ['#ff8c1a', '#222222'], ['#9b5de5', '#f1f1f1']];
    for(let i = 20; i < total; i += 55){
        const lado = aleatorio() < 0.5 ? -1 : 1;
        cenario.push({
            tipo: 'outdoor',
            z: i * COMPRIMENTO_SEG,
            offset: lado * (2.3 + aleatorio() * 0.4),
            colisao: false,
            cores: coresOutdoor[Math.floor(aleatorio() * coresOutdoor.length)]
        });
    }

    // placas de curva (setas amarelas) antes das curvas mais fortes
    placasPendentes.forEach(p => {
        const indice = Math.max(0, p.indice - 16);
        const lado = p.curva > 0 ? -1 : 1;      // do lado de fora da curva
        cenario.push({
            tipo: 'placa',
            z: indice * COMPRIMENTO_SEG + 100,
            offset: lado * 1.38,
            colisao: true,
            direcao: p.curva > 0 ? 1 : -1
        });
    });

    // pórtico da largada / chegada
    cenario.push({ tipo: 'portico', z: 100, offset: 0, colisao: false });
}

function segmentoEm(z){
    return segmentos[Math.floor(mod(z, comprimentoPista) / COMPRIMENTO_SEG) % segmentos.length];
}

// diferença (com volta) entre duas posições da pista: positivo = "para" está à frente de "de"
function difZ(de, para){
    let d = mod(para - de, comprimentoPista);
    if(d > comprimentoPista / 2){
        d -= comprimentoPista;
    }
    return d;
}

//============================
// CÉU E PRÉDIOS (camadas pré-desenhadas)
//============================
const TILE = 640;
let camadaLonge = null;
let camadaPerto = null;
let gradienteCeu = null;
let gradienteNeblina = null;

function criarCamada(semente, larguraMin, larguraMax, alturaMin, alturaMax, corPredio, corJanela, densidade, comEstrelas){
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = HORIZONTE;
    const g = c.getContext('2d');
    const aleatorio = criarAleatorio(semente);

    if(comEstrelas){
        for(let i = 0; i < 70; i++){
            g.fillStyle = 'rgba(255, 255, 255, ' + (0.35 + aleatorio() * 0.65).toFixed(2) + ')';
            g.fillRect(Math.floor(aleatorio() * TILE), Math.floor(aleatorio() * (HORIZONTE - 34)), 1, 1);
        }
        // lua
        g.fillStyle = '#fff6c2';
        g.beginPath();
        g.arc(430, 20, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(16, 26, 140, 0.55)';
        g.beginPath();
        g.arc(434, 18, 7, 0, Math.PI * 2);
        g.fill();
    }

    let x = 0;
    while(x < TILE){
        const w = Math.min(TILE - x, Math.floor(larguraMin + aleatorio() * (larguraMax - larguraMin)));
        const h = Math.floor(alturaMin + aleatorio() * (alturaMax - alturaMin));

        g.fillStyle = corPredio;
        g.fillRect(x, HORIZONTE - h, w, h);

        for(let wy = HORIZONTE - h + 3; wy < HORIZONTE - 3; wy += 4){
            for(let wx = x + 2; wx < x + w - 3; wx += 4){
                if(aleatorio() < densidade){
                    g.fillStyle = aleatorio() < 0.8 ? corJanela : '#ff9d3b';
                    g.fillRect(wx, wy, 2, 2);
                }
            }
        }

        // antena com luzinha
        if(h > 38 && aleatorio() < 0.5){
            g.fillStyle = corPredio;
            g.fillRect(x + Math.floor(w / 2), HORIZONTE - h - 6, 1, 6);
            g.fillStyle = '#ff4d4d';
            g.fillRect(x + Math.floor(w / 2), HORIZONTE - h - 7, 1, 1);
        }
        x += w;
    }
    return c;
}

function criarFundo(){
    camadaLonge = criarCamada(11, 10, 22, 14, 38, '#17237f', '#c9b04a', 0.28, true);
    camadaPerto = criarCamada(29, 14, 30, 22, 60, '#0b0f4a', '#ffd84a', 0.5, false);

    gradienteCeu = ctx.createLinearGradient(0, 0, 0, HORIZONTE);
    gradienteCeu.addColorStop(0, '#0d1678');
    gradienteCeu.addColorStop(1, '#3f66e8');

    gradienteNeblina = ctx.createLinearGradient(0, HORIZONTE - 9, 0, HORIZONTE + 9);
    gradienteNeblina.addColorStop(0, 'rgba(110, 140, 255, 0)');
    gradienteNeblina.addColorStop(0.5, 'rgba(110, 140, 255, 0.55)');
    gradienteNeblina.addColorStop(1, 'rgba(110, 140, 255, 0)');
}

//============================
// VARIÁVEIS DO JOGO
//============================
// 'inicial' | 'contagem' | 'correndo' | 'pausado' | 'fim' | 'chegada'
let estado = 'inicial';
let dificuldadeAtual = DIFICULDADES.medio;

let distancia;            // distância percorrida desde a linha de largada (pode ser negativa no começo)
let posicao;              // posição da câmera na pista
let velocidade;
let jogadorX;             // -1 (borda esquerda) ... 0 (centro) ... 1 (borda direita)
let inclinacao;           // inclinação visual da moto (-1 a 1)
let energia;              // energia do turbo (0 a 100)
let turboBloqueado;
let turboAtivo;
let tempoRestante;
let tempoCorrida;
let pontos;
let recorde = 0;
let recordeBatido;
let voltasCompletas;
let rivais;
let tremor;
let aviso;
let contagem;
let skyX;
let ultimaBatida;
let resultado;
let estadoAntesPausa = 'correndo';

const teclas = { esquerda: false, direita: false, acelerar: false, frear: false, turbo: false };

//============================
// RECORDE (um por dificuldade)
//============================
function chaveRecorde(){
    return 'recordeMotos_' + selDificuldade.value;
}

function lerRecorde(){
    try {
        return parseInt(localStorage.getItem(chaveRecorde()), 10) || 0;
    } catch (erro) {
        return 0;   // localStorage pode estar bloqueado (modo privado)
    }
}

function salvarRecorde(){
    try {
        localStorage.setItem(chaveRecorde(), String(recorde));
    } catch (erro) {
        // sem problemas, apenas não salva
    }
}

//============================
// SONS (Web Audio API - sem arquivos externos)
//============================
let audioCtx = null;
let somLigado = true;
let motor = null;

function garantirAudio(){
    if(!audioCtx){
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === 'suspended'){
        audioCtx.resume();
    }
}

function tocarSom(freq, duracao = 0.1, tipo = 'square', volume = 0.05, freqFinal = null){
    if(!somLigado){
        return;
    }
    try {
        garantirAudio();
        const agora = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const ganho = audioCtx.createGain();

        osc.type = tipo;
        osc.frequency.setValueAtTime(freq, agora);
        if(freqFinal){
            osc.frequency.exponentialRampToValueAtTime(freqFinal, agora + duracao);
        }
        ganho.gain.setValueAtTime(volume, agora);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + duracao);

        osc.connect(ganho);
        ganho.connect(audioCtx.destination);
        osc.start(agora);
        osc.stop(agora + duracao);
    } catch (erro) {
        // navegador sem suporte a áudio: ignora
    }
}

function tocarSequencia(notas, tipo = 'triangle'){
    notas.forEach((freq, i) => {
        setTimeout(() => tocarSom(freq, 0.12, tipo, 0.06), i * 90);
    });
}

// Som do motor: um oscilador contínuo cuja altura acompanha a velocidade
function iniciarMotor(){
    if(motor || !somLigado){
        return;
    }
    try {
        garantirAudio();
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        const filtro = audioCtx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 500;
        const ganho = audioCtx.createGain();
        ganho.gain.value = 0;
        osc.connect(filtro);
        filtro.connect(ganho);
        ganho.connect(audioCtx.destination);
        osc.start();
        motor = { osc: osc, filtro: filtro, ganho: ganho };
    } catch (erro) {
        motor = null;
    }
}

function atualizarMotor(){
    if(!motor || !audioCtx){
        return;
    }
    try {
        const t = audioCtx.currentTime;
        const ativo = somLigado && (estado === 'correndo' || estado === 'contagem');
        const p = estado === 'correndo' ? velocidade / VEL_MAX : 0;
        motor.ganho.gain.setTargetAtTime(ativo ? 0.025 + p * 0.02 : 0, t, 0.08);
        motor.osc.frequency.setTargetAtTime(50 + p * 170 + (turboAtivo ? 40 : 0), t, 0.06);
        motor.filtro.frequency.setTargetAtTime(400 + p * 900, t, 0.1);
    } catch (erro) {
        // ignora
    }
}

//============================
// PREPARAR / INICIAR A CORRIDA
//============================
function atualizarCamera(){
    posicao = mod(distancia - Z_JOGADOR, comprimentoPista);
}

function criarRivais(){
    rivais = [];
    const cfg = dificuldadeAtual;
    for(let i = 0; i < cfg.rivais; i++){
        const fila = Math.floor(i / 2) + 1;
        const lado = i % 2 === 0 ? -1 : 1;
        const dist = -700 + fila * 520;
        rivais.push({
            dist: dist,
            z: mod(dist, comprimentoPista),
            offset: lado * 0.45,
            vel: 0,
            velAlvo: VEL_MAX * (cfg.velMin + Math.random() * (cfg.velMax - cfg.velMin)),
            paleta: PALETAS_RIVAIS[i % PALETAS_RIVAIS.length]
        });
    }
}

function prepararCorrida(){
    dificuldadeAtual = DIFICULDADES[selDificuldade.value];

    distancia = -700;
    velocidade = 0;
    jogadorX = 0;
    inclinacao = 0;
    energia = 100;
    turboBloqueado = false;
    turboAtivo = false;
    tempoRestante = dificuldadeAtual.tempoInicial;
    tempoCorrida = 0;
    pontos = 0;
    recordeBatido = false;
    voltasCompletas = -1;
    tremor = 0;
    aviso = null;
    skyX = 0;
    ultimaBatida = 0;
    resultado = null;
    contagem = 3;

    recorde = lerRecorde();
    criarRivais();
    atualizarCamera();
}

function iniciarCorrida(){
    zerarTeclas();
    prepararCorrida();
    estado = 'contagem';
    iniciarMotor();
    tocarSom(440, 0.12, 'square', 0.06);
}

function voltarParaTelaInicial(){
    zerarTeclas();
    prepararCorrida();
    estado = 'inicial';
}

//============================
// AVISOS NA TELA
//============================
function mostrarAviso(texto, cor, duracao){
    aviso = { texto: texto, cor: cor, tempo: duracao, total: duracao };
}

//============================
// ATUALIZAÇÃO (um passo fixo de 1/60 s)
//============================
function posicaoAtual(){
    let posicaoRank = 1;
    rivais.forEach(r => {
        if(r.dist > distancia){
            posicaoRank++;
        }
    });
    return posicaoRank;
}

function passo(dt){
    if(aviso){
        aviso.tempo -= dt;
        if(aviso.tempo <= 0){
            aviso = null;
        }
    }
    tremor *= 0.9;

    if(estado === 'contagem'){
        const antes = Math.ceil(contagem);
        contagem -= dt;
        const depois = Math.ceil(contagem);
        if(depois !== antes && depois >= 1){
            tocarSom(440, 0.12, 'square', 0.06);
        }
        if(contagem <= 0){
            estado = 'correndo';
            mostrarAviso('LARGOU!', '#ffd166', 1);
            tocarSom(880, 0.3, 'square', 0.06, 1320);
        }
        return;
    }

    if(estado !== 'correndo'){
        return;
    }

    atualizarJogador(dt);
    if(estado === 'correndo'){
        atualizarRivais(dt);
    }
}

function atualizarJogador(dt){
    tempoRestante -= dt;
    tempoCorrida += dt;
    if(tempoRestante <= 0){
        tempoRestante = 0;
        terminarPorTempo();
        return;
    }

    const seg = segmentoEm(distancia);
    const percVel = velocidade / VEL_MAX;

    // turbo
    turboAtivo = teclas.turbo && !turboBloqueado && energia > 0;
    if(turboAtivo){
        energia -= 40 * dt;
        if(energia <= 0){
            energia = 0;
            turboBloqueado = true;
            turboAtivo = false;
        }
    }else{
        energia = Math.min(100, energia + 10 * dt);
        if(turboBloqueado && energia >= 25){
            turboBloqueado = false;
        }
    }

    // aceleração
    const limite = turboAtivo ? VEL_MAX * TURBO_MULT : VEL_MAX;
    if(teclas.frear){
        velocidade += FREIO * dt;
    }else if(teclas.acelerar || turboAtivo){
        velocidade += ACEL * (turboAtivo ? 2.2 : 1) * dt;
    }else{
        velocidade += DESACEL * dt;
    }

    // fora da pista a moto perde velocidade
    const foraDaPista = Math.abs(jogadorX) > BORDA_PISTA;
    if(foraDaPista && velocidade > LIMITE_FORA){
        velocidade += DESACEL_FORA * dt;
        tremor = Math.max(tremor, 1.5);
    }

    if(velocidade > limite){
        velocidade = Math.max(limite, velocidade - ACEL * 1.5 * dt);   // fim do turbo: volta ao normal aos poucos
    }
    velocidade = Math.max(0, velocidade);

    // direção e força centrífuga
    const dx = dt * 2.2 * Math.min(1.25, percVel);
    if(teclas.esquerda){
        jogadorX -= dx;
    }
    if(teclas.direita){
        jogadorX += dx;
    }
    jogadorX -= dt * 2 * percVel * percVel * seg.curva * CENTRIFUGA;
    jogadorX = limitar(jogadorX, -2.6, 2.6);

    // inclinação visual
    const entrada = (teclas.direita ? 1 : 0) - (teclas.esquerda ? 1 : 0);
    const alvoInclinacao = limitar(entrada * 0.8 + seg.curva * percVel * 0.12, -1, 1);
    inclinacao += (alvoInclinacao - inclinacao) * Math.min(1, dt * 10);

    // avanço
    const avanco = velocidade * dt;
    distancia += avanco;
    pontos += avanco * 0.01;
    atualizarCamera();
    skyX += seg.curva * percVel * dt * 28;

    if(Math.floor(pontos) > recorde){
        recorde = Math.floor(pontos);
        recordeBatido = true;
    }

    // voltas
    const completas = Math.floor(distancia / comprimentoPista);
    if(completas > voltasCompletas){
        voltasCompletas = completas;
        if(completas >= dificuldadeAtual.voltas){
            terminarCorrida();
            return;
        }
        if(completas >= 1){
            concluirVolta(completas);
        }
    }

    verificarColisoes(avanco, dt);
}

function concluirVolta(completas){
    const bonus = dificuldadeAtual.bonusVolta;
    tempoRestante += bonus;
    pontos += 1000;
    mostrarAviso('+' + bonus + 's  VOLTA ' + (completas + 1), '#7dff7d', 1.8);
    tocarSequencia([523, 659, 784]);
}

function bater(texto){
    velocidade = Math.min(velocidade, VEL_MAX * 0.2);
    tremor = 9;
    ultimaBatida = 0.6;
    mostrarAviso(texto, '#ff6b6b', 0.9);
    tocarSom(160, 0.35, 'sawtooth', 0.08, 40);
}

function verificarColisoes(avanco, dt){
    ultimaBatida -= dt;
    const zj = mod(distancia, comprimentoPista);

    // postes e placas
    if(ultimaBatida <= 0){
        for(let i = 0; i < cenario.length; i++){
            const item = cenario[i];
            if(!item.colisao){
                continue;
            }
            const dz = difZ(zj, item.z);
            if(dz < -80 || dz > avanco + 120){
                continue;
            }
            if(Math.abs(item.offset - jogadorX) < 0.22){
                bater('BATEU!');
                jogadorX += jogadorX >= item.offset ? 0.4 : -0.4;
                break;
            }
        }
    }

    // outras motos
    for(let i = 0; i < rivais.length; i++){
        const r = rivais[i];
        const dz = difZ(zj, r.z);
        if(dz > -100 && dz < 320 && Math.abs(r.offset - jogadorX) < 0.34){
            if(dz > 0 && velocidade > r.vel){
                velocidade = r.vel * 0.85;
                distancia -= Math.min(120, 320 - dz);
                jogadorX += (jogadorX >= r.offset ? 1 : -1) * 0.05;
                if(ultimaBatida <= 0){
                    tremor = 5;
                    ultimaBatida = 0.4;
                    tocarSom(220, 0.15, 'square', 0.06, 120);
                }
            }
        }
    }
}

//============================
// RIVAIS (inteligência simples: acelerar, frear na curva e desviar)
//============================
function desviar(r, outro, dt){
    const dz = difZ(r.z, outro.z);
    if(dz <= 0 || dz > 3500){
        return;
    }
    if(Math.abs(outro.offset - r.offset) > 0.42){
        return;
    }
    let dir = outro.offset > r.offset ? -1 : 1;
    if(Math.abs(r.offset + dir * 0.5) > 0.9){
        dir = -dir;     // sem espaço desse lado
    }
    r.offset += dir * 1.1 * dt;
    if(dz < 900){
        r.vel = Math.min(r.vel, outro.vel);
    }
}

function atualizarRivais(dt){
    const jogador = { z: mod(distancia, comprimentoPista), offset: jogadorX, vel: velocidade };

    rivais.forEach(r => {
        const seg = segmentoEm(r.z);
        const alvo = r.velAlvo * (1 - Math.min(0.3, Math.abs(seg.curva) * 0.05));
        const dif = alvo - r.vel;
        r.vel += Math.max(-VEL_MAX * 0.6 * dt, Math.min(VEL_MAX * 0.3 * dt, dif));

        desviar(r, jogador, dt);
        rivais.forEach(outro => {
            if(outro !== r){
                desviar(r, outro, dt);
            }
        });

        r.offset = limitar(r.offset, -0.9, 0.9);
        r.dist += r.vel * dt;
        r.z = mod(r.dist, comprimentoPista);
    });
}

//============================
// FIM DA CORRIDA
//============================
function terminarPorTempo(){
    estado = 'fim';
    zerarTeclas();
    finalizarRecorde();
    tremor = 8;
    tocarSom(300, 0.6, 'sawtooth', 0.08, 60);
}

function terminarCorrida(){
    estado = 'chegada';
    zerarTeclas();

    const pos = posicaoAtual();
    const bonusPos = BONUS_POSICAO[Math.min(pos, BONUS_POSICAO.length - 1)];
    const bonusTempo = Math.floor(tempoRestante) * 100;
    pontos += bonusPos + bonusTempo;
    resultado = { pos: pos, bonusPos: bonusPos, bonusTempo: bonusTempo, tempo: tempoCorrida };

    finalizarRecorde();
    tocarSequencia([523, 659, 784, 1047]);
}

function finalizarRecorde(){
    if(Math.floor(pontos) > recorde){
        recorde = Math.floor(pontos);
        recordeBatido = true;
    }
    if(recordeBatido){
        salvarRecorde();
    }
}

function pausarJogo(){
    if(estado === 'correndo'){
        estado = 'pausado';
        zerarTeclas();
        finalizarRecorde();
    }else if(estado === 'pausado'){
        estado = 'correndo';
    }
}

//===================================
// PROJEÇÃO (pseudo-3D)
//===================================
const xb = new Float64Array(DISTANCIA_DESENHO + 4);   // deslocamento lateral da pista em cada limite de segmento
let percentBase = 0;
let segBaseIndice = 0;

function calcularCurvas(){
    const seg = segmentoEm(posicao);
    segBaseIndice = seg.indice;
    percentBase = mod(posicao, COMPRIMENTO_SEG) / COMPRIMENTO_SEG;

    let x = 0;
    let dx = -(seg.curva * percentBase);
    for(let n = 0; n <= DISTANCIA_DESENHO + 2; n++){
        xb[n] = x;
        const s = segmentos[(segBaseIndice + n) % segmentos.length];
        x += dx;
        dx += s.curva;
    }
}

function deslocamentoCurva(z){
    const t = (z + percentBase * COMPRIMENTO_SEG) / COMPRIMENTO_SEG;
    const n = Math.min(DISTANCIA_DESENHO, Math.floor(t));
    const f = Math.min(1, t - n);
    return (xb[n] + (xb[n + 1] - xb[n]) * f) * ESCALA_CURVA;
}

// converte um ponto da pista (distância z à frente da câmera, deslocamento lateral
// normalizado) em coordenadas da tela
function projetar(zRel, offset){
    const escala = PROFUNDIDADE_CAMERA / zRel;
    const desloc = deslocamentoCurva(zRel);
    return {
        x: LARGURA / 2 + escala * (desloc - jogadorX * LARGURA_ESTRADA + offset * LARGURA_ESTRADA) * LARGURA / 2,
        y: HORIZONTE + K_PROJECAO / zRel,
        escala: escala
    };
}

function zRelativo(z){
    return mod(z - posicao, comprimentoPista);
}

//=============================
// DESENHO
//=============================
function texto(conteudo, x, y, tamanho, cor, alinhamento = 'left'){
    ctx.font = tamanho + 'px "Press Start 2P", monospace';
    ctx.textAlign = alinhamento;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000000';
    ctx.fillText(conteudo, x + 1, y + 1);
    ctx.fillStyle = cor;
    ctx.fillText(conteudo, x, y);
}

function desenharCeu(){
    ctx.fillStyle = gradienteCeu;
    ctx.fillRect(0, 0, LARGURA, HORIZONTE);

    // as camadas andam em velocidades diferentes (paralaxe) quando a pista faz curva
    [[camadaLonge, 0.35], [camadaPerto, 0.7]].forEach(([camada, fator]) => {
        const deslocamento = mod(skyX * fator, TILE);
        ctx.drawImage(camada, -deslocamento, 0);
        ctx.drawImage(camada, TILE - deslocamento, 0);
    });
}

function desenharLinha(y, d){
    const z = K_PROJECAO / d;
    const t = (z + percentBase * COMPRIMENTO_SEG) / COMPRIMENTO_SEG;
    const n = Math.floor(t);
    const f = t - n;
    const seg = segmentos[(segBaseIndice + n) % segmentos.length];

    const desloc = (xb[n] + (xb[n + 1] - xb[n]) * f) * ESCALA_CURVA;
    const escala = d / (ALTURA_CAMERA * ALTURA / 2);
    const centro = LARGURA / 2 + escala * (desloc - jogadorX * LARGURA_ESTRADA) * LARGURA / 2;
    const w = escala * LARGURA_ESTRADA * LARGURA / 2;
    const zebra = w / Math.max(6, FAIXAS * 2);

    // ao longe as listras ficariam piscando: usamos uma cor média
    const longe = z > 9000;
    const paleta = longe ? CORES.media : (seg.escuro ? CORES.escuro : CORES.claro);

    const xe = Math.round(centro - w);
    const xd = Math.round(centro + w);
    const ze = Math.round(centro - w - zebra);
    const zd = Math.round(centro + w + zebra);

    ctx.fillStyle = paleta.chao;
    ctx.fillRect(0, y, LARGURA, 1);

    ctx.fillStyle = paleta.zebra;
    ctx.fillRect(ze, y, xe - ze, 1);
    ctx.fillRect(xd, y, zd - xd, 1);

    ctx.fillStyle = paleta.pista;
    ctx.fillRect(xe, y, xd - xe, 1);

    // linha de largada / chegada (xadrez)
    if(!longe && seg.indice <= 1){
        const colunas = 14;
        for(let i = 0; i < colunas; i++){
            ctx.fillStyle = (i + seg.indice) % 2 === 0 ? '#f5f5f5' : '#161616';
            const a = xe + Math.round((xd - xe) * i / colunas);
            const b = xe + Math.round((xd - xe) * (i + 1) / colunas);
            ctx.fillRect(a, y, b - a, 1);
        }
        return;
    }

    // faixas brancas tracejadas
    if(paleta.faixa){
        ctx.fillStyle = paleta.faixa;
        const larguraFaixa = Math.max(1, Math.round(w / 32));
        for(let i = 1; i < FAIXAS; i++){
            const fx = Math.round(centro - w + (w * 2 * i) / FAIXAS - larguraFaixa / 2);
            ctx.fillRect(fx, y, larguraFaixa, 1);
        }
    }
}

function desenharEstrada(){
    // linha logo abaixo do horizonte (muito longe): só a cor de névoa
    ctx.fillStyle = CORES.media.chao;
    ctx.fillRect(0, HORIZONTE, LARGURA, 2);

    for(let y = HORIZONTE + 2; y < ALTURA; y++){
        desenharLinha(y, y - HORIZONTE);
    }
}

function desenharNeblina(){
    ctx.fillStyle = gradienteNeblina;
    ctx.fillRect(0, HORIZONTE - 9, LARGURA, 18);
}

//----------------------------
// Objetos do cenário
//----------------------------
function desenharPoste(x, y, escala, lado){
    const px = u => u * escala * ALTURA / 2;
    const alt = px(2700);
    const larg = Math.max(1, px(70));
    const braco = px(560);
    const dir = -lado;      // o braço aponta para a pista

    ctx.fillStyle = '#2b3170';
    ctx.fillRect(x - larg / 2, y - alt, larg, alt);
    ctx.fillRect(dir > 0 ? x : x - braco, y - alt, braco, Math.max(1, px(60)));

    const lx = x + dir * braco;
    const ly = y - alt + px(60);
    ctx.fillStyle = '#fff6b0';
    ctx.fillRect(lx - px(120), ly, px(240), Math.max(1, px(55)));

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.arc(lx, ly + px(30), px(330), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function desenharPlaca(x, y, escala, direcao){
    const px = u => u * escala * ALTURA / 2;
    const larg = Math.max(1, px(50));
    const altPoste = px(1250);
    const pw = px(760);
    const ph = px(560);
    const py = y - altPoste - ph / 2;

    ctx.fillStyle = '#3a3f7a';
    ctx.fillRect(x - larg / 2, y - altPoste, larg, altPoste);

    ctx.fillStyle = '#111111';
    ctx.fillRect(x - pw / 2 - 1, py - ph / 2 - 1, pw + 2, ph + 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(x - pw / 2, py - ph / 2, pw, ph);

    // seta preta apontando para o lado da curva
    const a = pw * 0.28;
    const b = ph * 0.32;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.moveTo(x - direcao * a, py - b);
    ctx.lineTo(x + direcao * a, py);
    ctx.lineTo(x - direcao * a, py + b);
    ctx.closePath();
    ctx.fill();
}

function desenharOutdoor(x, y, escala, cores){
    const px = u => u * escala * ALTURA / 2;
    const larg = Math.max(1, px(60));
    const altPoste = px(1500);
    const pw = px(1700);
    const ph = px(850);
    const py = y - altPoste - ph;

    ctx.fillStyle = '#2b3170';
    ctx.fillRect(x - pw / 3, y - altPoste, larg, altPoste);
    ctx.fillRect(x + pw / 3 - larg, y - altPoste, larg, altPoste);

    ctx.fillStyle = '#10143f';
    ctx.fillRect(x - pw / 2 - 1, py - 1, pw + 2, ph + 2);
    ctx.fillStyle = cores[0];
    ctx.fillRect(x - pw / 2, py, pw, ph);
    ctx.fillStyle = cores[1];
    ctx.fillRect(x - pw / 2 + pw * 0.08, py + ph * 0.18, pw * 0.5, ph * 0.22);
    ctx.fillRect(x - pw / 2 + pw * 0.08, py + ph * 0.55, pw * 0.8, ph * 0.12);
}

function desenharPortico(x, y, escala){
    const px = u => u * escala * ALTURA / 2;
    const meia = LARGURA_ESTRADA * 1.28 * escala * LARGURA / 2;
    const altura = px(3000);
    const larg = Math.max(2, px(230));
    const faixaAlt = px(520);

    ctx.fillStyle = '#d8dbe8';
    ctx.fillRect(x - meia - larg / 2, y - altura, larg, altura);
    ctx.fillRect(x + meia - larg / 2, y - altura, larg, altura);

    // faixa xadrez no topo
    const colunas = 16;
    const total = meia * 2 + larg;
    for(let i = 0; i < colunas; i++){
        for(let linha = 0; linha < 2; linha++){
            ctx.fillStyle = (i + linha) % 2 === 0 ? '#f5f5f5' : '#161616';
            ctx.fillRect(x - meia - larg / 2 + (total * i) / colunas, y - altura + (faixaAlt * linha) / 2, total / colunas + 0.6, faixaAlt / 2);
        }
    }
}

//----------------------------
// Moto vista por trás
//----------------------------
function desenharMoto(cx, cy, s, paleta, incl, turbo, quadro){
    ctx.save();
    ctx.translate(cx, cy);

    // sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(incl * 0.28);
    ctx.scale(s, s);

    // chamas do turbo
    if(turbo){
        const f = 2.5 + (quadro % 3);
        ctx.fillStyle = '#ff9f1c';
        ctx.beginPath();
        ctx.arc(-10.5, -12, f, 0, Math.PI * 2);
        ctx.arc(10.5, -12, f, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(-10.5, -12, f * 0.5, 0, Math.PI * 2);
        ctx.arc(10.5, -12, f * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // pneu traseiro
    ctx.fillStyle = '#141414';
    ctx.fillRect(-4, -24, 8, 24);
    ctx.fillStyle = '#2f2f2f';
    for(let y = -22; y < 0; y += 4){
        ctx.fillRect(-4, y, 8, 1);
    }

    // rabeta
    ctx.fillStyle = paleta[0];
    ctx.beginPath();
    ctx.moveTo(-9, -26);
    ctx.lineTo(9, -26);
    ctx.lineTo(7, -37);
    ctx.lineTo(-7, -37);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = paleta[1];
    ctx.fillRect(-1.5, -37, 3, 11);

    // lanterna
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(-4, -30, 8, 2.5);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(-7, -32, 14, 6);
    ctx.globalAlpha = 1;

    // escapamentos
    ctx.fillStyle = '#b8bcc8';
    ctx.fillRect(-13, -14, 5, 3);
    ctx.fillRect(8, -14, 5, 3);
    ctx.fillStyle = '#6b6f7d';
    ctx.fillRect(-13, -11, 5, 1);
    ctx.fillRect(8, -11, 5, 1);

    // pernas e botas
    ctx.fillStyle = '#26264a';
    ctx.fillRect(-11, -36, 6, 15);
    ctx.fillRect(5, -36, 6, 15);
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(-11, -22, 6, 4);
    ctx.fillRect(5, -22, 6, 4);

    // tronco (jaqueta)
    ctx.fillStyle = paleta[1];
    ctx.beginPath();
    ctx.moveTo(-9, -36);
    ctx.lineTo(9, -36);
    ctx.lineTo(8, -52);
    ctx.lineTo(-8, -52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = paleta[0];
    ctx.fillRect(-9, -43, 18, 3);

    // braços
    ctx.strokeStyle = paleta[1];
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -49);
    ctx.lineTo(-15, -43);
    ctx.lineTo(-13, -36);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, -49);
    ctx.lineTo(15, -43);
    ctx.lineTo(13, -36);
    ctx.stroke();

    // manoplas
    ctx.fillStyle = '#111111';
    ctx.fillRect(-16, -38, 5, 4);
    ctx.fillRect(11, -38, 5, 4);

    // capacete
    ctx.fillStyle = paleta[2];
    ctx.beginPath();
    ctx.arc(0, -58, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paleta[0];
    ctx.fillRect(-1.5, -64.5, 3, 12);

    ctx.restore();
}

function tamanhoMoto(escala){
    return (ALTURA_MOTO * escala * ALTURA / 2) / ALTURA_DESENHO_MOTO;
}

//----------------------------
// Todos os objetos, do mais longe para o mais perto
//----------------------------
function desenharObjetos(){
    const limite = (DISTANCIA_DESENHO - 4) * COMPRIMENTO_SEG;
    const itens = [];

    cenario.forEach(item => {
        const zr = zRelativo(item.z);
        if(zr > 150 && zr < limite){
            itens.push({ tipo: 'cenario', item: item, z: zr });
        }
    });
    rivais.forEach(r => {
        const zr = zRelativo(r.z);
        if(zr > 150 && zr < limite){
            itens.push({ tipo: 'rival', rival: r, z: zr });
        }
    });
    itens.push({ tipo: 'jogador', z: Z_JOGADOR });

    itens.sort((a, b) => b.z - a.z);

    const quadro = Math.floor(performance.now() / 60);

    itens.forEach(it => {
        if(it.tipo === 'jogador'){
            const p = projetar(Z_JOGADOR, 0);
            const yMoto = HORIZONTE + K_PROJECAO / Z_JOGADOR;
            desenharMoto(LARGURA / 2, yMoto, tamanhoMoto(p.escala), PALETA_JOGADOR, inclinacao, turboAtivo, quadro);
            return;
        }

        const offset = it.tipo === 'rival' ? it.rival.offset : it.item.offset;
        const p = projetar(it.z, offset);

        if(it.tipo === 'rival'){
            const seg = segmentoEm(it.rival.z);
            const incl = limitar(seg.curva * 0.12, -0.6, 0.6);
            desenharMoto(p.x, p.y, tamanhoMoto(p.escala), it.rival.paleta, incl, false, quadro);
            return;
        }

        const item = it.item;
        const lado = item.offset < 0 ? -1 : 1;
        if(item.tipo === 'poste'){
            desenharPoste(p.x, p.y, p.escala, lado);
        }else if(item.tipo === 'placa'){
            desenharPlaca(p.x, p.y, p.escala, item.direcao);
        }else if(item.tipo === 'outdoor'){
            desenharOutdoor(p.x, p.y, p.escala, item.cores);
        }else if(item.tipo === 'portico'){
            desenharPortico(p.x, p.y, p.escala);
        }
    });
}

//----------------------------
// HUD
//----------------------------
function formatarTempo(segundos){
    const total = Math.max(0, segundos);
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const c = Math.floor((total * 100) % 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
}

function desenharHUD(){
    if(estado === 'inicial'){
        return;
    }
    const cfg = dificuldadeAtual;

    // tempo (centro do topo)
    const tempo = Math.ceil(tempoRestante);
    const corTempo = tempoRestante < 10 && Math.floor(performance.now() / 250) % 2 === 0 ? '#ff5d5d' : '#ffd23f';
    texto('TEMPO', LARGURA / 2, 3, 8, '#ffffff', 'center');
    texto(String(tempo), LARGURA / 2, 13, 16, corTempo, 'center');

    // volta e posição
    const volta = Math.min(cfg.voltas, Math.max(1, voltasCompletas + 1));
    texto('VOLTA ' + volta + '/' + cfg.voltas, 5, 4, 8, '#ffffff');
    texto('POS ' + posicaoAtual() + '/' + (rivais.length + 1), LARGURA - 5, 4, 8, '#ffffff', 'right');

    // velocidade (km/h)
    const kmh = Math.round((velocidade / VEL_MAX) * 300);
    texto(String(kmh), 6, 150, 16, '#ffffff');
    texto('KM/H', 6, 168, 8, '#9fb4ff');

    // turbo
    texto('TURBO', LARGURA - 6, 150, 8, turboBloqueado ? '#ff7a7a' : '#ffb347', 'right');
    ctx.fillStyle = '#000000';
    ctx.fillRect(LARGURA - 86, 162, 80, 10);
    ctx.fillStyle = turboBloqueado ? '#7a3b3b' : (turboAtivo ? '#fff3b0' : '#ff9f1c');
    ctx.fillRect(LARGURA - 85, 163, Math.round(78 * energia / 100), 8);

    // avisos
    if(aviso){
        const alfa = Math.min(1, aviso.tempo / 0.3);
        ctx.globalAlpha = alfa;
        texto(aviso.texto, LARGURA / 2, 44, 12, aviso.cor, 'center');
        ctx.globalAlpha = 1;
    }

    // contagem regressiva
    if(estado === 'contagem'){
        const numero = Math.ceil(contagem);
        const fracao = contagem - Math.floor(contagem);
        ctx.globalAlpha = 0.4 + 0.6 * fracao;
        texto(String(numero), LARGURA / 2, 52, 32, '#ffffff', 'center');
        ctx.globalAlpha = 1;
    }
}

// Telas sobrepostas (início, pausa, fim, chegada)
function desenharTelas(){
    if(estado === 'correndo' || estado === 'contagem'){
        return;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    const cx = LARGURA / 2;
    const cfg = dificuldadeAtual;

    if(estado === 'inicial'){
        texto('CORRIDA', cx, 36, 20, '#ffd23f', 'center');
        texto('DE MOTOS', cx, 62, 20, '#ffd23f', 'center');
        texto('Dificuldade: ' + cfg.nome, cx, 102, 8, '#ffffff', 'center');
        texto(cfg.voltas + ' voltas  -  ' + cfg.tempoInicial + 's de tempo', cx, 116, 8, '#9fb4ff', 'center');
        texto('ENTER ou toque para largar', cx, 146, 8, '#ffffff', 'center');
    }else if(estado === 'pausado'){
        texto('PAUSADO', cx, 70, 20, '#ffffff', 'center');
        texto('P para continuar', cx, 102, 8, '#9fb4ff', 'center');
    }else if(estado === 'fim'){
        texto('TEMPO ESGOTADO', cx, 36, 16, '#ff6b6b', 'center');
        texto('Pontuacao: ' + Math.floor(pontos), cx, 78, 10, '#ffffff', 'center');
        texto('Voltas: ' + Math.max(0, voltasCompletas) + '/' + cfg.voltas, cx, 98, 8, '#9fb4ff', 'center');
        if(recordeBatido){
            texto('NOVO RECORDE!', cx, 118, 10, '#ffd23f', 'center');
        }
        texto('ENTER para tentar de novo', cx, 150, 8, '#ffffff', 'center');
    }else if(estado === 'chegada' && resultado){
        texto('CHEGADA!', cx, 14, 16, '#ffd23f', 'center');
        texto(resultado.pos + 'o lugar de ' + (rivais.length + 1), cx, 42, 10, '#ffffff', 'center');
        texto('Tempo: ' + formatarTempo(resultado.tempo), cx, 62, 8, '#9fb4ff', 'center');
        texto('Bonus posicao: +' + resultado.bonusPos, cx, 80, 8, '#ffffff', 'center');
        texto('Bonus tempo:   +' + resultado.bonusTempo, cx, 94, 8, '#ffffff', 'center');
        texto('Pontuacao: ' + Math.floor(pontos), cx, 114, 10, '#7dff7d', 'center');
        if(recordeBatido){
            texto('NOVO RECORDE!', cx, 132, 10, '#ffd23f', 'center');
        }
        texto('ENTER para correr de novo', cx, 156, 8, '#ffffff', 'center');
    }
}

function desenhar(){
    calcularCurvas();

    ctx.save();
    if(tremor > 0.5){
        ctx.translate(Math.round((Math.random() - 0.5) * tremor), Math.round((Math.random() - 0.5) * tremor));
    }
    desenharCeu();
    desenharEstrada();
    desenharNeblina();
    desenharObjetos();
    ctx.restore();

    desenharHUD();
    desenharTelas();
}

//============================
// PAINEL (HTML)
//============================
let ultimoPainel = '';

function atualizarPainel(){
    const cfg = dificuldadeAtual;
    const volta = Math.min(cfg.voltas, Math.max(1, voltasCompletas + 1));
    const chave = [Math.floor(pontos), recorde, volta, cfg.voltas, estado === 'inicial' ? 0 : posicaoAtual()].join('|');
    if(chave === ultimoPainel){
        return;
    }
    ultimoPainel = chave;

    elPontos.textContent = Math.floor(pontos);
    elRecorde.textContent = recorde;
    elVolta.textContent = volta + '/' + cfg.voltas;
    elPosicao.textContent = estado === 'inicial' ? '-' : posicaoAtual() + 'º';
}

//===================================
// LOOP PRINCIPAL (passo fixo + desenho a cada quadro)
//===================================
let acumulador = 0;
let ultimoTempo = 0;

function loop(tempo){
    requestAnimationFrame(loop);

    // limita o dt para não "pular" tempo quando a aba fica em segundo plano
    const dt = Math.min(0.1, (tempo - ultimoTempo) / 1000);
    ultimoTempo = tempo;

    if(estado !== 'pausado'){
        acumulador += dt;
        while(acumulador >= PASSO){
            passo(PASSO);
            acumulador -= PASSO;
        }
    }

    atualizarMotor();
    atualizarPainel();
    desenhar();
}

//===========================
// CONTROLES
//===========================
function zerarTeclas(){
    Object.keys(teclas).forEach(chave => {
        teclas[chave] = false;
    });
    document.querySelectorAll('.tecla[data-tecla]').forEach(botao => botao.classList.remove('ativa'));
}

const acoesTeclado = {
    ArrowLeft: 'esquerda', a: 'esquerda',
    ArrowRight: 'direita', d: 'direita',
    ArrowUp: 'acelerar',   w: 'acelerar',
    ArrowDown: 'frear',    s: 'frear',
    ' ': 'turbo',          Shift: 'turbo',
    p: 'pausar',           Escape: 'pausar',
    Enter: 'iniciar'
};

function nomeDaTecla(event){
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

document.addEventListener('keydown', function(event){
    if(event.ctrlKey || event.metaKey || event.altKey){
        return;   // não atrapalha atalhos do navegador
    }
    if(event.target && event.target.tagName === 'SELECT'){
        return;   // deixa o select funcionar com o teclado
    }

    const acao = acoesTeclado[nomeDaTecla(event)];
    if(!acao){
        return;
    }
    event.preventDefault();

    // tira o foco de botões: evita que Espaço/Enter "cliquem" no botão focado
    if(document.activeElement && document.activeElement !== document.body){
        document.activeElement.blur();
    }

    if(acao === 'iniciar'){
        if(!event.repeat){
            iniciarCorrida();
        }
    }else if(acao === 'pausar'){
        if(!event.repeat){
            pausarJogo();
        }
    }else{
        if(acao === 'turbo' && !event.repeat && (estado === 'inicial' || estado === 'fim' || estado === 'chegada')){
            iniciarCorrida();
            return;
        }
        teclas[acao] = true;
    }
});

document.addEventListener('keyup', function(event){
    const acao = acoesTeclado[nomeDaTecla(event)];
    if(acao && teclas.hasOwnProperty(acao)){
        teclas[acao] = false;
    }
});

window.addEventListener('blur', zerarTeclas);

//===========================
// BOTÕES, SELECT E BOTÕES NA TELA
//===========================
document.getElementById('btnIniciar').addEventListener('click', function(){
    this.blur();
    iniciarCorrida();
});

document.getElementById('btnPausar').addEventListener('click', function(){
    this.blur();
    pausarJogo();
});

btnSom.addEventListener('click', function(){
    somLigado = !somLigado;
    this.textContent = somLigado ? '\u{1F50A} Som: ligado' : '\u{1F507} Som: desligado';
    this.blur();
    if(somLigado && (estado === 'correndo' || estado === 'contagem')){
        iniciarMotor();
    }
});

selDificuldade.addEventListener('change', function(){
    this.blur();
    voltarParaTelaInicial();
});

// botões na tela: segurar = tecla pressionada (funciona com vários dedos ao mesmo tempo)
document.querySelectorAll('.tecla[data-tecla]').forEach(botao => {
    const nome = botao.dataset.tecla;

    botao.addEventListener('pointerdown', function(event){
        event.preventDefault();
        try {
            botao.setPointerCapture(event.pointerId);
        } catch (erro) {
            // sem captura: segue normalmente
        }
        teclas[nome] = true;
        botao.classList.add('ativa');
    });

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(tipo => {
        botao.addEventListener(tipo, function(){
            teclas[nome] = false;
            botao.classList.remove('ativa');
        });
    });

    botao.addEventListener('contextmenu', event => event.preventDefault());
});

// toque no jogo: inicia ou retoma
canvas.addEventListener('pointerup', function(){
    if(estado === 'pausado'){
        pausarJogo();
    }else if(estado === 'inicial' || estado === 'fim' || estado === 'chegada'){
        iniciarCorrida();
    }
});

// pausa sozinho se o jogador trocar de aba
document.addEventListener('visibilitychange', function(){
    if(document.hidden && estado === 'correndo'){
        pausarJogo();
    }
});

//===========================
// INÍCIO
//===========================
if(document.fonts && document.fonts.load){
    document.fonts.load('8px "Press Start 2P"');
}

criarPista();
criarCenario();
criarFundo();
prepararCorrida();
requestAnimationFrame(loop);