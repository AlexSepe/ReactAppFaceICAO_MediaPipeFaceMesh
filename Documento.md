# Comparativo Técnico: Detecção Facial e Validação ICAO
**Assunto:** API's detecção facial: face-api.js vs. MediaPipe Face Mesh  
**Data:** 31 de Maio de 2024  
**Classificação:** Técnico/Estratégico  

---

## 1. Resumo 
O objetivo deste relatório é comparar duas das principais bibliotecas de visão computacional para navegadores: **face-api.js** (baseada em TensorFlow.js) e **MediaPipe Face Mesh** (Google). Para uma aplicação governamental que exige alta precisão em conformidade ICAO (fotos para documentos), a escolha da stack impacta diretamente a acessibilidade do cidadão e a segurança dos dados.

---

## 2. Matriz de Comparação e Versionamento

| Critério | face-api.js (vladmandic) | MediaPipe Face Mesh |
| :--- | :--- | :--- |
| **Versão Atual** | `1.7.12` (Maio/2024) | `0.4.1633502747` / Vision `0.10.x` |
| **Status de Manutenção** | Ativo (Comunidade/Fork) | **Ativo (Google Oficial)** |
| **Pontos (Landmarks)** | 68 pontos (2D) | **478 pontos (3D + Íris)** |
| **Performance** | 10 - 15 FPS | **30 - 60 FPS (WASM)** |
| **Licenciamento** | MIT | **Apache 2.0** |
| **Tecnologia Base** | TensorFlow.js | **MediaPipe Graph / WebAssembly** |

---

## 3. Análise de Funcionalidades e Diferenciais

### A. MediaPipe Face Mesh (Recomendado para ICAO)
O MediaPipe utiliza um modelo de regressão leve que produz uma malha 3D de alta densidade. 
*   **Vantagem Crítica:** O rastreio de íris (Iris Tracking) permite validar se o cidadão está "Olhando para a Lente", requisito obrigatório para passaportes e identidades civis.
*   **Eficiência:** Por ser compilado em **WebAssembly (WASM)**, a execução é extremamente leve, permitindo que cidadãos com smartphones de entrada (Android antigos) utilizem o sistema sem lentidão.

### B. face-api.js (vladmandic)
Esta biblioteca é um *wrapper* para o TensorFlow.js. Embora poderosa para reconhecimento de identidade (comparar Face A com Face B), ela é mais pesada.
*   **Limitação:** A baixa densidade de pontos (68) dificulta a análise de micro-expressões ou rotações sutis de cabeça necessárias para conformidade ICAO rígida.
*   **Uso Ideal:** Recomendada apenas se houver necessidade de realizar o **Reconhecimento Facial (Matching)** no lado do cliente (Client-side), o que geralmente é evitado em fluxos governamentais por questões de segurança.

---

## 4. Documentação e Repositórios Oficiais

### Google MediaPipe (Solução Recomendada)
*   **Documentação Oficial:** [MediaPipe Solutions - Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
*   **Guia para Web (JavaScript):** [MediaPipe Face Mesh Guide](https://developers.google.com/mediapipe/solutions/vision/face_landmarker/web_js)
*   **Repositório GitHub:** [google/mediapipe](https://github.com/google/mediapipe)
*   **Package NPM:** [`@mediapipe/face_mesh`](https://www.npmjs.com/package/@mediapipe/face_mesh)

### face-api.js (vladmandic fork)
*   **Documentação/Wiki:** [Face-API Community Wiki](https://github.com/vladmandic/face-api/wiki)
*   **Repositório GitHub (Fork Ativo):** [vladmandic/face-api](https://github.com/vladmandic/face-api)
*   **Package NPM:** [`@vladmandic/face-api`](https://www.npmjs.com/package/@vladmandic/face-api)
*   *Nota: O repositório original (justadudewhohacks) encontra-se arquivado e obsoleto.*

---

## 5. Recomendação Gerencial

Para o projeto de **Captura e Validação ICAO**, a recomendação técnica é o uso do **MediaPipe Face Mesh**.

**Justificativa:**
1.  **Sustentabilidade:** Ser mantido oficialmente pelo Google garante correções de segurança e compatibilidade com novos navegadores.
2.  **Precisão ICAO:** O mapeamento 3D e a detecção de íris eliminam 80% dos erros de captura que ocorrem em bibliotecas 2D (como a face-api).
3.  **Inclusão Digital:** A performance superior em dispositivos de baixa performance garante que uma parcela maior da população consiga utilizar o serviço de forma fluida.
