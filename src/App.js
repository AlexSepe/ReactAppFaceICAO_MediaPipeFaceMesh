import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FaceMesh, FACEMESH_TESSELATION, FACEMESH_RIGHT_EYE, FACEMESH_LEFT_EYE, FACEMESH_LEFT_IRIS, FACEMESH_RIGHT_IRIS, FACEMESH_CONTOURS } from '@mediapipe/face_mesh';
import * as drawingUtils from '@mediapipe/drawing_utils';
import * as cam from '@mediapipe/camera_utils';
import AnalysisMetrics from './AnalysisMetrics';
import CompliantPhotos from './CompliantPhotos';

// Constantes de Pontos do Face Mesh (Índices Oficiais)
const FACE_TOP = 10;
const FACE_BOTTOM = 152;
const LEFT_EYE = 33;
const RIGHT_EYE = 263;
const NOSE_TIP = 1;
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
// Olho Esquerdo: Cantos (33, 133) e Íris (468)
// Olho Direito: Cantos (362, 263) e Íris (473)
const L_EYE_OUTER = 33;
const L_EYE_INNER = 133;
const L_IRIS_CENTER = 468;
const R_EYE_OUTER = 263;
const R_EYE_INNER = 362;
const R_IRIS_CENTER = 473;

const initialReport = [
  { id: 'faceDetected', label: 'Face detectada', passed: null },
  { id: 'lookingAtCamera', label: 'Olhando para câmera', passed: null }, 
  { id: 'neutralExpression', label: 'Expressão neutra', passed: null },
  { id: 'alignment', label: 'Alinhamento (Roll/Yaw)', passed: null },
  { id: 'centered', label: 'Rosto centralizado', passed: null },
  { id: 'faceSize', label: 'Tamanho do rosto (60-75%)', passed: null },
  { id: 'background', label: 'Fundo uniforme', passed: null },
  { id: 'lighting', label: 'Iluminação ideal', passed: null }
];

function App() {
  // Refs
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const faceMeshRef = useRef(null);
  const isLockedRef = useRef(false); // <--- NOVO: Bloqueio instantâneo
  
  // States
  const [report, setReport] = useState(initialReport);
  const [qualityScore, setQualityScore] = useState(0);
  const [qualityGrade, setQualityGrade] = useState('-');
  const [analysisSummary, setAnalysisSummary] = useState([]);
  const [autoCapture, setAutoCapture] = useState(true);
  const [lastAutoCapture, setLastAutoCapture] = useState(0);
  const [compliantSnapshots, setCompliantSnapshots] = useState([]);
  const [theme, setTheme] = useState('light');
  const [statusMessage, setStatusMessage] = useState('Iniciando MediaPipe...');

  const [showLandmarks, setShowLandmarks] = useState(false);
  const showLandmarksRef = useRef(false);

  // Sincroniza o Ref sempre que o state mudar
  useEffect(() => {
    showLandmarksRef.current = showLandmarks;
  }, [showLandmarks]);  

  // Ref para o estado de autoCapture para que o onResults sempre veja o valor atualizado
  // sem precisar reiniciar o MediaPipe  
  const autoCaptureStateRef = useRef(autoCapture);
  useEffect(() => {
    autoCaptureStateRef.current = autoCapture;
    // Se o usuário clicou no botão para reiniciar, liberamos o bloqueio
    if (autoCapture) {
      isLockedRef.current = false;
    }
  }, [autoCapture]);
  
  // 1. Lógica de análise de imagem (Pixel processing) - Otimizada para rodar apenas sob demanda
  const analyzePixels = (videoElement, landmarks) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; // Low res para análise de luz/fundo (performance)
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let brightnessSum = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      brightnessSum += (0.299 * imageData[i] + 0.587 * imageData[i+1] + 0.114 * imageData[i+2]);
    }
    const avgBrightness = brightnessSum / (canvas.width * canvas.height);
    
    // Simplificação para o exemplo: (Idealmente usar variância de bordas para fundo)
    return {
      lightingGood: avgBrightness > 70 && avgBrightness < 190,
      backgroundGood: true, // Placeholder para análise de variância de cor
      brightness: avgBrightness.toFixed(1)
    };
  };

  const checkLookingAtCamera = (landmarks) => {
    // Cálculo para o Olho Esquerdo
    // Medimos onde a íris está em relação ao espaço entre o canto interno e externo
    const leftEyeWidth = Math.abs(landmarks[L_EYE_INNER].x - landmarks[L_EYE_OUTER].x);
    const leftIrisPos = Math.abs(landmarks[L_IRIS_CENTER].x - landmarks[L_EYE_OUTER].x);
    const leftRatio = leftIrisPos / leftEyeWidth;

    // Cálculo para o Olho Direito
    const rightEyeWidth = Math.abs(landmarks[R_EYE_OUTER].x - landmarks[R_EYE_INNER].x);
    const rightIrisPos = Math.abs(landmarks[R_IRIS_CENTER].x - landmarks[R_EYE_INNER].x);
    const rightRatio = rightIrisPos / rightEyeWidth;

    // Em um olhar frontal perfeito, o ratio é próximo de 0.5
    // Tolerância: entre 0.42 e 0.58 costuma ser o ideal para ICAO
    const horizontalCheck = (leftRatio > 0.40 && leftRatio < 0.60) && 
                            (rightRatio > 0.40 && rightRatio < 0.60);

    return horizontalCheck;
  };

  // 2. Callback principal do MediaPipe
  const onResults = useCallback((results) => {    
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setReport(initialReport.map(r => ({ ...r, passed: false })));
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const video = webcamRef.current.video;
    
    // --- CÁLCULOS GEOMÉTRICOS ICAO ---
    
    // Roll (Inclinação lateral)
    const roll = Math.abs(Math.atan2(landmarks[RIGHT_EYE].y - landmarks[LEFT_EYE].y, landmarks[RIGHT_EYE].x - landmarks[LEFT_EYE].x) * 180 / Math.PI);
    
    // Yaw (Rotação lateral - proporção entre nariz e bochechas)
    const distLeft = Math.sqrt(Math.pow(landmarks[NOSE_TIP].x - landmarks[LEFT_CHEEK].x, 2));
    const distRight = Math.sqrt(Math.pow(landmarks[RIGHT_CHEEK].x - landmarks[NOSE_TIP].x, 2));
    const yawRatio = Math.max(distLeft, distRight) / Math.min(distLeft, distRight);

    // Tamanho do rosto (Altura relativa ao frame)
    const faceHeight = Math.abs(landmarks[FACE_BOTTOM].y - landmarks[FACE_TOP].y);
    
    // Expressão Neutra (Distância entre lábios)
    const mouthOpen = Math.abs(landmarks[MOUTH_TOP].y - landmarks[MOUTH_BOTTOM].y);

    // Centralização
    const isCentered = Math.abs(landmarks[NOSE_TIP].x - 0.5) < 0.1;

    // Análise de Pixels (rodar apenas se a geometria estiver quase boa para poupar CPU)
    const pixelStats = (faceHeight > 0.5) ? analyzePixels(video, landmarks) : { 
         lightingGood: false, 
         backgroundGood: false, 
         brightness: 0 };

    const isLookingAtCamera = checkLookingAtCamera(landmarks);

    // --- ATUALIZAÇÃO DO RELATÓRIO ---
    const resultsICAO = {
      faceDetected: true,
      lookingAtCamera: isLookingAtCamera, // INTEGRADO
      neutralExpression: mouthOpen < 0.025,
      alignment: roll < 5 && yawRatio < 1.6,
      centered: isCentered,
      faceSize: faceHeight > 0.55 && faceHeight < 0.8,
      background: pixelStats.backgroundGood,
      lighting: pixelStats.lightingGood
    };

    const nextReport = initialReport.map(rule => ({
      ...rule,
      passed: resultsICAO[rule.id]
    }));

    // Score e UI
    const passCount = Object.values(resultsICAO).filter(Boolean).length;
    const score = Math.round((passCount / Object.keys(resultsICAO).length) * 100);
    
    setReport(nextReport);
    setQualityScore(score);
    setQualityGrade(score > 85 ? 'A' : score > 60 ? 'B' : 'C');
    setAnalysisSummary([
      `Roll: ${roll.toFixed(1)}°`,
      `Yaw Ratio: ${yawRatio.toFixed(2)}`,
      `Face Height: ${(faceHeight * 100).toFixed(1)}%`,
      `Brilho Médio: ${pixelStats.brightness}`
    ]);
// setAnalysisSummary([
//         `Roll ${metrics.rollDeg}° (<=7° allowed)`,
//         `Yaw ${metrics.yawDeg}° (<=15° allowed)`,
//         `Pitch ${metrics.pitchDeg}° (<=10° allowed)`,
//         `Face height ratio ${metrics.faceHeightRatio}%`,
//         `Resolution ${metrics.resolution}`,
//         `Background variance ${metrics.bgVariance}`,
//         `Lighting variance ${metrics.faceVariance}, brightness ${metrics.faceBrightness}`
//       ]);

    // --- AUTO CAPTURE REATORADO ---
    const allPassed = Object.values(resultsICAO).every(v => v === true);

    // Verificamos o Ref (instantâneo) em vez do State (lento)
    if (autoCaptureStateRef.current && !isLockedRef.current && allPassed) {
      
      // 1. BLOQUEIO IMEDIATO (Síncrono)
      isLockedRef.current = true; 
      
      // 2. DESLIGA O ESTADO DE BUSCA (Para a UI)
      setAutoCapture(false);
      autoCaptureStateRef.current = false;

      console.info('Condições ideais detectadas. Capturando foto única...');

      // 3. CAPTURA
      const screenshot = webcamRef.current.getScreenshot({ width: 1024, height: 768 });
      
      if (screenshot) {
          setCompliantSnapshots(prev => [...prev.slice(-4), screenshot]);
          setStatusMessage('✅ Foto capturada com sucesso!');
      }
    } 

    drawCanvas(results);
  }, []);

  // 3. Desenho do Overlay
  const drawCanvas = (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Desenha Máscara Oval
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * 0.25, canvas.height * 0.4, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    if (showLandmarksRef.current && results.multiFaceLandmarks) {
      for (const landmarks of results.multiFaceLandmarks) {
        // Desenha a malha fina do rosto (Tesselation)
        drawingUtils.drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {
          color: '#C0C0C070',
          lineWidth: 0
        });
        drawingUtils.drawConnectors(ctx, landmarks, FACEMESH_CONTOURS, {
          color: '#e0e41770',
          lineWidth: 1
        });          
        // Desenha contorno dos olhos
        drawingUtils.drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, { color: '#FF3030', lineWidth: 1 });
        drawingUtils.drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, { color: '#30FF30', lineWidth: 1 });
        // Desenha a Íris (Ponto central e círculo)        
        drawingUtils.drawConnectors(ctx, landmarks, FACEMESH_RIGHT_IRIS, {color: '#a01919', lineWidth: 1});
        drawingUtils.drawConnectors(ctx, landmarks, FACEMESH_LEFT_IRIS, {color: '#30FF30', lineWidth: 1});
      }
    }
  };

  // 4. Inicialização do MediaPipe
  useEffect(() => {
    if (faceMeshRef.current) return; // Já inicializado

    faceMeshRef.current = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMeshRef.current.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMeshRef.current.onResults(onResults);

    if (webcamRef.current && webcamRef.current.video) {
      cameraRef.current = new cam.Camera(webcamRef.current.video, {
        onFrame: async () => {
          await faceMeshRef.current.send({ image: webcamRef.current.video });
        },
        width: 640,
        height: 480,
      });
      cameraRef.current.start();
    }

    return () => {
      if (cameraRef.current) cameraRef.current.stop();
      if (faceMeshRef.current) faceMeshRef.current.close();
    };
  }, [onResults]);

  // UI RENDER
  const overallPass = report.every(item => item.passed === true);

  return (
    <div className={`app-container theme-${theme}`}>
      <h1>ICAO Face Engine <small>(MediaPipe Refactored)</small></h1>

      <div className="main-layout" style={{ display: 'flex', gap: '20px', padding: '20px' }}>
        
        {/* Lado Esquerdo: Webcam */}
        <div className="panel webcam-box" style={{ position: 'relative' }}>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
            style={{ borderRadius: '8px', width: '640px' }}
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            style={{ position: 'absolute', top: 16, left: 16, borderRadius: '8px' }}
          />

          <div className="controls" style={{ marginTop: '15px' }}>
             <button onClick={() => setAutoCapture(true)} disabled={autoCapture}>
               {autoCapture ? 'Buscando face ideal...' : 'Reiniciar Auto-Captura'}
             </button>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input 
                type="checkbox" 
                checked={showLandmarks} 
                onChange={(e) => setShowLandmarks(e.target.checked)} 
              />
              Exibir Pontos da Face
            </label>             
             <select onChange={(e) => setTheme(e.target.value)} value={theme}>
               <option value="light">Claro</option>
               <option value="dark">Escuro</option>
             </select>
          </div>
        </div>

        {/* Lado Direito: Relatório Flutuante / Fixo */}
        <div className="report-panel" style={{ 
          flex: 1, 
          backgroundColor: 'var(--bg-secondary)', 
          padding: '20px', 
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)' 
        }}>
          <h2>Compliance ICAO</h2>
          <div className="score-badge">
            Status: <strong>{qualityGrade} ({qualityScore}%)</strong>
          </div>
          
          <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
            <tbody>
              {report.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 0' }}>{item.label}</td>
                  <td style={{ 
                    textAlign: 'right', 
                    fontWeight: 'bold', 
                    color: item.passed ? '#2ecc71' : '#e74c3c' 
                  }}>
                    {item.passed ? '✓ PASS' : '✗ FAIL'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ 
            marginTop: '20px', 
            padding: '15px', 
            borderRadius: '8px', 
            backgroundColor: overallPass ? '#d4edda' : '#f8d7da',
            textAlign: 'center'
          }}>
            <strong style={{ color: overallPass ? '#155724' : '#721c24' }}>
              {overallPass ? 'APROVADO PARA DOCUMENTO' : 'REQUISITOS PENDENTES'}
            </strong>
          </div>
        </div>
      </div>

      <AnalysisMetrics analysisSummary={analysisSummary} 
        report={report}
        qualityScore={qualityScore}
        qualityGrade={qualityGrade}
        overallPass={overallPass}/>
      <CompliantPhotos compliantSnapshots={compliantSnapshots} />
      
      <div className="footer-status" style={{ padding: '20px', fontStyle: 'italic' }}>
        {statusMessage}
      </div>
    </div>
  );
}

export default App;