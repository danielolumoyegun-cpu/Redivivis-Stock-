/* ============================================================
   Camera — getUserMedia + BarcodeDetector
   ============================================================ */
(function (global) {
  'use strict';

  let _stream         = null;
  let _videoEl        = null;
  let _canvasEl       = null;
  let _detectionTimer = null;
  let _detector       = null;
  let _started        = false;

  async function init() {
    if (!('BarcodeDetector' in window)) return;
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      _detector = new BarcodeDetector({ formats });
    } catch (_) {
      _detector = null;
    }
  }

  async function start(videoEl, canvasEl) {
    _videoEl  = videoEl;
    _canvasEl = canvasEl;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not supported in this browser. Please use a modern mobile browser (Chrome, Safari).');
    }

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    try {
      _stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoEl.srcObject = _stream;
      await videoEl.play();
      _started = true;
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied. Please allow camera access in your browser settings and try again.');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No camera found on this device.');
      }
      throw new Error('Could not start camera: ' + err.message);
    }
  }

  function stop() {
    stopDetection();
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_videoEl) _videoEl.srcObject = null;
    _started = false;
  }

  function capture() {
    if (!_videoEl || !_canvasEl || !_started) return null;
    _canvasEl.width  = _videoEl.videoWidth  || 640;
    _canvasEl.height = _videoEl.videoHeight || 480;
    const ctx = _canvasEl.getContext('2d');
    ctx.drawImage(_videoEl, 0, 0);
    return _canvasEl.toDataURL('image/jpeg', 0.8);
  }

  function startDetection(onCode) {
    if (!_detector) return false;
    stopDetection();

    const detect = async () => {
      if (!_videoEl || !_started) return;
      try {
        const results = await _detector.detect(_videoEl);
        results.forEach(r => onCode(r.rawValue, r.format));
      } catch (_) {
        /* skip frame */
      }
    };

    _detectionTimer = setInterval(detect, 350);
    return true;
  }

  function stopDetection() {
    if (_detectionTimer) { clearInterval(_detectionTimer); _detectionTimer = null; }
  }

  function isStarted()         { return _started; }
  function hasBarcodeSupport() { return !!_detector; }

  global.Camera = { init, start, stop, capture, startDetection, stopDetection, isStarted, hasBarcodeSupport };

})(window);
