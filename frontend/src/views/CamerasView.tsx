import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getCamerasApi,
  createCameraApi,
  updateCameraApi,
  deleteCameraApi,
  testCameraApi,
  getCameraStreamTicketApi,
  getCameraStreamUrl
} from '../api/endpoints';
import type { Camera } from '../types';
import {
  Video, RefreshCw, Plus, Trash2, Tv, X, LayoutGrid,
  CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp,
  Settings, Radio, Maximize2, Minimize2
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { confirmCameraDeletion, showErrorToast, showSuccessToast } from '../utils/notifications';

type ProtocolType = 'USB' | 'IP_WEBCAM' | 'RTSP' | 'HTTP_MJPEG' | 'DROIDCAM';
type ViewMode = 'zones' | 'grid';

function useCameraStreamUrl(cameraId: number, showConfidence: boolean, retry = 0, initialDelayMs = 0) {
  const requestKey = `${cameraId}:${showConfidence}:${retry}`;
  const [result, setResult] = useState<{ key: string; url: string | null; error: boolean }>({
    key: '',
    url: null,
    error: false,
  });

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      getCameraStreamTicketApi(cameraId)
        .then(ticket => {
          if (active) setResult({ key: requestKey, url: getCameraStreamUrl(cameraId, ticket, showConfidence), error: false });
        })
        .catch(() => {
          if (active) setResult({ key: requestKey, url: null, error: true });
        });
    }, initialDelayMs);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [cameraId, showConfidence, retry, requestKey, initialDelayMs]);

  return {
    url: result.key === requestKey ? result.url : null,
    error: result.key === requestKey && result.error,
  };
}

const ZONES = [
  {
    id: 'DOBLADO_LAMINA',
    label: 'Doblado de Lamina',
    stage: 'Etapa 1',
    color: '#637b99',
    bg: '#eef2f7',
    border: '#ccd6e2',
    desc: 'Control del proceso de doblez y formado de lamina metalica'
  },
  {
    id: 'ARMADO_ESTRUCTURAL',
    label: 'Armado Estructural',
    stage: 'Etapa 2',
    color: '#65728a',
    bg: '#eff1f5',
    border: '#cfd5df',
    desc: 'Ensamble y soldadura de la estructura del chasis'
  },
  {
    id: 'VINILADO',
    label: 'Vinilado',
    stage: 'Etapa 3',
    color: '#437e6f',
    bg: '#eef5f1',
    border: '#cbdcd3',
    desc: 'Aplicacion de vinilo y acabados finales del producto'
  },
];
type ProductionZone = typeof ZONES[number] | {
  id: string;
  label: string;
  stage: string;
  color: string;
  bg: string;
  border: string;
  desc: string;
};

interface ProtoInfo {
  label: string;
  placeholder: string;
  hint: string;
  example: string;
  color: string;
  steps: string[];
}

const PROTO_DATA: Record<ProtocolType, ProtoInfo> = {
  USB: {
    label: 'Camara USB / Webcam',
    placeholder: '0',
    hint: 'Indice del dispositivo. La primera webcam es 0, la segunda 1, etc.',
    example: '0',
    color: 'var(--primary)',
    steps: [
      'Conecta la camara USB al equipo.',
      'Ingresa el indice del dispositivo (0, 1, 2...).',
      'Pulsa Probar Conexion para verificar.'
    ]
  },
  IP_WEBCAM: {
    label: 'Celular - IP Webcam (Android)',
    placeholder: 'http://192.168.1.X:8080/video',
    hint: 'Instala IP Webcam en tu celular Android y usa la URL que te muestra la app.',
    example: 'http://192.168.1.45:8080/video',
    color: '#16a34a',
    steps: [
      'Descarga IP Webcam desde Google Play Store.',
      'Abre la app y toca Iniciar servidor.',
      'La app muestra la IP, ej: http://192.168.1.45:8080',
      'Ingresa esa URL seguida de /video en el campo fuente.',
      'Asegurate de estar en la misma red WiFi que el servidor.'
    ]
  },
  DROIDCAM: {
    label: 'Celular - DroidCam (Android/iOS)',
    placeholder: 'http://192.168.1.X:4747/video',
    hint: 'Instala DroidCam en tu celular (puerto 4747 por defecto).',
    example: 'http://192.168.1.45:4747/video',
    color: '#66758a',
    steps: [
      'Descarga DroidCam desde Play Store o App Store.',
      'Abre la app y toma nota de la IP.',
      'El puerto por defecto es 4747.',
      'Ingresa la URL segun el ejemplo.',
      'Ambos dispositivos deben estar en la misma red WiFi.'
    ]
  },
  RTSP: {
    label: 'Camara IP / CCTV - RTSP',
    placeholder: 'rtsp://user:password@192.168.1.X:554/stream1',
    hint: 'Protocolo estandar para camaras IP, NVR y CCTV profesionales.',
    example: 'rtsp://admin:admin123@192.168.1.100:554/Streaming/Channels/101',
    color: '#dc2626',
    steps: [
      'Asegurate de conocer el usuario y password de la camara.',
      'Consulta el manual para la ruta RTSP (/stream1, /live, etc).',
      'La mayoria usa el puerto 554.',
      'Ingresa la URL completa con credenciales.',
      'Si no hay credenciales, omite la parte usuario:password@.'
    ]
  },
  HTTP_MJPEG: {
    label: 'Stream HTTP MJPEG',
    placeholder: 'http://192.168.1.X:PORT/mjpeg',
    hint: 'Para camaras que transmiten video MJPEG por HTTP.',
    example: 'http://192.168.1.50:80/video.mjpeg',
    color: '#f59e0b',
    steps: [
      'Consulta el manual de tu camara para la URL MJPEG.',
      'Generalmente es /video, /mjpeg o /stream.mjpg.',
      'Ingresa la URL HTTP completa.',
      'Algunos dispositivos requieren autenticacion en la URL.'
    ]
  }
};

function detectProtocol(source: string): ProtocolType {
  if (!source || source === '0' || /^\d+$/.test(source)) return 'USB';
  if (source.startsWith('rtsp://')) return 'RTSP';
  if (source.includes('4747')) return 'DROIDCAM';
  if (source.includes('8080')) return 'IP_WEBCAM';
  if (source.startsWith('http')) return 'HTTP_MJPEG';
  return 'USB';
}

function getStatus(cam: Camera) {
  if (cam.is_connected) return { label: 'Conectada', color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle size={11} /> };
  if (cam.last_check_at) return { label: 'Sin senal', color: '#dc2626', bg: '#fee2e2', icon: <XCircle size={11} /> };
  return { label: 'Sin verificar', color: '#d97706', bg: '#fef3c7', icon: <Clock size={11} /> };
}

// ── Protocol Wizard ─────────────────────────────────────────────────────────
const ProtocolWizard: React.FC<{
  proto: ProtocolType;
  onProto: (p: ProtocolType) => void;
  source: string;
  onSource: (s: string) => void;
}> = ({ proto, onProto, source, onSource }) => {
  const [open, setOpen] = useState(false);
  const pd = PROTO_DATA[proto];

  return (
    <div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {(Object.keys(PROTO_DATA) as ProtocolType[]).map(p => {
          const d = PROTO_DATA[p];
          const sel = proto === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => { onProto(p); onSource(d.example); }}
              style={{
                padding: '4px 9px', borderRadius: '6px',
                border: sel ? `2px solid ${d.color}` : '1px solid #e2e8f0',
                backgroundColor: sel ? d.color + '18' : '#fff',
                color: sel ? d.color : '#64748b',
                fontSize: '0.70rem', fontWeight: sel ? 700 : 500, cursor: 'pointer'
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <input
        type="text" className="input-control"
        placeholder={pd.placeholder} value={source}
        onChange={e => onSource(e.target.value)} required
      />
      <p style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '4px' }}>
        {pd.hint} — <em>Ej: <code style={{ backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>{pd.example}</code></em>
      </p>
      <button
        type="button" onClick={() => setOpen(!open)}
        style={{
          fontSize: '0.70rem', color: pd.color, background: 'none',
          border: 'none', cursor: 'pointer', fontWeight: 600,
          padding: 0, display: 'flex', alignItems: 'center', gap: '3px'
        }}
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Ocultar guia' : 'Ver guia paso a paso'}
      </button>
      {open && (
        <div style={{
          marginTop: '8px', padding: '10px 13px',
          backgroundColor: pd.color + '0d',
          border: `1px solid ${pd.color}33`,
          borderRadius: '7px'
        }}>
          <p style={{ fontSize: '0.70rem', fontWeight: 700, color: pd.color, marginBottom: '6px' }}>
            Guia: {pd.label}
          </p>
          <ol style={{ paddingLeft: '16px', margin: 0 }}>
            {pd.steps.map((s, i) => (
              <li key={i} style={{ fontSize: '0.75rem', color: '#374151', lineHeight: 1.5 }}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

// ── Zone Selector ────────────────────────────────────────────────────────────
const ZoneSelector: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div>
    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
      {ZONES.map(z => (
        <button
          key={z.id} type="button" onClick={() => onChange(z.id)}
          style={{
            flex: '1 1 105px', padding: '7px 5px', borderRadius: '6px',
            border: value === z.id ? `2px solid ${z.color}` : '1px solid #e2e8f0',
            backgroundColor: value === z.id ? z.bg : '#fff',
            color: value === z.id ? z.color : '#64748b',
            fontSize: '0.68rem', fontWeight: value === z.id ? 700 : 500,
            cursor: 'pointer', textAlign: 'center', lineHeight: 1.5
          }}
        >
          <div>{z.stage}</div>
          <div>{z.label}</div>
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(ZONES.some(zone => zone.id === value) ? '' : value)}
        style={{
          flex: '1 1 105px', padding: '7px 5px', borderRadius: '6px',
          border: !ZONES.some(zone => zone.id === value) ? '2px solid #0f766e' : '1px solid #e2e8f0',
          backgroundColor: !ZONES.some(zone => zone.id === value) ? '#f0fdfa' : '#fff',
          color: !ZONES.some(zone => zone.id === value) ? '#0f766e' : '#64748b',
          fontSize: '0.68rem', fontWeight: !ZONES.some(zone => zone.id === value) ? 700 : 500,
          cursor: 'pointer', textAlign: 'center'
        }}
      >Otra zona</button>
    </div>
    {!ZONES.some(zone => zone.id === value) && (
      <input
        type="text" className="input-control" placeholder="Nombre de la zona"
        value={value} onChange={event => onChange(event.target.value)} required
        style={{ marginTop: '8px' }}
      />
    )}
  </div>
);

// ── Camera Card ──────────────────────────────────────────────────────────────
const CameraCard: React.FC<{
  cam: Camera;
  testingId: number | null;
  onStream: (c: Camera) => void;
  onEdit: (c: Camera) => void;
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
  isAdmin: boolean;
  isStreamPaused: boolean;
  showConfidence: boolean;
}> = ({ cam, testingId, onStream, onEdit, onTest, onDelete, isAdmin, isStreamPaused, showConfidence }) => {
  const { user } = useAuth();
  const [streamError, setStreamError] = useState(false);
  const [streamAttempt, setStreamAttempt] = useState(0);
  const reconnectTimer = useRef<number | null>(null);
  const { url: streamUrl, error: ticketError } = useCameraStreamUrl(cam.id, showConfidence, streamAttempt);
  useEffect(() => {
    if (!ticketError) return;
    reconnectTimer.current = window.setTimeout(() => {
      setStreamAttempt(attempt => attempt + 1);
    }, 5000);
    return () => {
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [ticketError]);
  useEffect(() => () => {
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
  }, []);
  const status = getStatus(cam);
  const streamFailed = streamError || ticketError;
  const protoKey = detectProtocol(cam.source);
  const pd = PROTO_DATA[protoKey];

  return (
    <div
      style={{
        backgroundColor: '#fff', border: '1px solid #e2e8f0',
        borderRadius: '10px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'box-shadow 0.2s'
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)')}
    >
      <div
        onClick={() => onStream(cam)}
        style={{
          backgroundColor: '#111827', aspectRatio: '16 / 9', minHeight: '140px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', overflow: 'hidden'
        }}
      >
        {cam.is_active && !streamFailed && !isStreamPaused && streamUrl ? (
          <img
            key={streamAttempt}
            src={streamAttempt ? `${streamUrl}&refresh=${streamAttempt}` : streamUrl}
            alt={`Video en directo: ${cam.name}`}
            loading="lazy"
            onError={() => {
              setStreamError(true);
              if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
              reconnectTimer.current = window.setTimeout(() => {
                setStreamError(false);
                setStreamAttempt(attempt => attempt + 1);
              }, 5000);
            }}
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, objectFit: 'cover' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', color: '#aab4c2' }}>
            {cam.is_active ? <AlertTriangle size={22} /> : <Video size={22} />}
            <span style={{ fontSize: '0.70rem' }}>
              {cam.is_active ? (isStreamPaused ? 'Mostrada en otra vista' : 'Sin señal de video') : 'Cámara desactivada'}
            </span>
            {streamFailed && (
              <button
                type="button" className="btn btn-outline btn-sm"
                onClick={event => {
                  event.stopPropagation();
                  if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
                  setStreamError(false);
                  setStreamAttempt(attempt => attempt + 1);
                }}
                style={{ color: '#e5e7eb', borderColor: '#6b7280' }}
              ><RefreshCw size={11} /> Reintentar</button>
            )}
          </div>
        )}
        <span style={{
          position: 'absolute', top: 7, left: 8,
          backgroundColor: pd.color, color: '#fff',
          fontSize: '0.59rem', padding: '2px 6px', borderRadius: '99px', fontWeight: 700
        }}>
          {protoKey.replace('_', ' ')}
        </span>
        <div style={{
          position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
          width: 24, height: 24, backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Maximize2 size={12} style={{ color: '#fff' }} />
        </div>
      </div>

      <div style={{ padding: '11px 13px', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a' }}>{cam.name}</span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            backgroundColor: status.bg, color: status.color,
            fontSize: '0.61rem', fontWeight: 700, padding: '2px 6px', borderRadius: '99px'
          }}>
            {status.icon} {status.label}
          </span>
        </div>
        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Confianza YOLO:</span>
            <strong style={{ color: '#0f172a' }}>{(cam.confidence_threshold * 100).toFixed(0)}%</strong>
          </div>
          <div style={{ marginTop: '3px' }}>
            Fuente:{' '}
            <code style={{
              backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '4px',
              fontSize: '0.67rem', wordBreak: 'break-all', color: '#0f172a'
            }}>
              {cam.source.length > 34 ? cam.source.slice(0, 34) + '...' : cam.source}
            </code>
          </div>
          {cam.last_detection_at && (
            <div style={{ color: '#94a3b8', fontSize: '0.66rem', marginTop: '3px' }}>
              Ultima deteccion: {new Date(cam.last_detection_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '9px 13px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        <button onClick={() => onStream(cam)} className="btn btn-primary btn-sm" style={{ flex: 1, minWidth: 70 }}>
          <Tv size={12} /> Ver Vivo
        </button>
        {(isAdmin || user?.role === 'OPERATOR') && <button onClick={() => onTest(cam.id)} disabled={testingId === cam.id} className="btn btn-outline btn-sm" style={{ flex: 1, minWidth: 70 }}>
          {testingId === cam.id ? <RefreshCw size={11} className="animate-spin" /> : <Radio size={11} />}{testingId === cam.id ? 'Probando...' : 'Probar'}
        </button>}
        {isAdmin && (
          <>
            <button onClick={() => onEdit(cam)} className="btn btn-outline btn-sm" title="Configurar">
              <Settings size={11} />
            </button>
            <button
              onClick={() => onDelete(cam.id)} className="btn btn-outline btn-sm"
              style={{ color: '#dc2626' }} title="Eliminar"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Stream Modal ─────────────────────────────────────────────────────────────
const StreamModal: React.FC<{ camera: Camera; onClose: () => void; showConfidence: boolean }> = ({ camera, onClose, showConfidence }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retry, setRetry] = useState(0);
  const { url, error: ticketError } = useCameraStreamUrl(camera.id, showConfidence, retry, 0);
  const hasError = err || ticketError;

  useEffect(() => {
    if (!hasError) return;
    const timeout = window.setTimeout(() => {
      setErr(false);
      setRetry(value => value + 1);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [hasError]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === modalRef.current);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === modalRef.current) {
        await document.exitFullscreen();
      } else {
        await modalRef.current?.requestFullscreen();
      }
    } catch {
      showErrorToast('No se pudo activar la pantalla completa.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content camera-stream-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="camera-stream-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: err ? '#ef4444' : '#10b981',
              boxShadow: err ? 'none' : '0 0 6px #10b981'
            }} />
            <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.89rem' }}>{camera.name}</span>
            <span style={{
              backgroundColor: '#1e293b', color: '#94a3b8',
              fontSize: '0.63rem', padding: '2px 7px', borderRadius: '99px'
            }}>{camera.zone}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <span style={{ fontSize: '0.67rem', color: '#64748b' }}>
              YOLO: <strong style={{ color: '#10b981' }}>{(camera.confidence_threshold * 100).toFixed(0)}%</strong>
            </span>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="camera-stream-action"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="camera-stream-action"
              title="Cerrar vista de cámara"
              aria-label="Cerrar vista de cámara"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="camera-stream-frame">
          {!hasError && url ? (
            <img
              src={url} alt={camera.name}
              className="camera-stream-image"
              onError={() => setErr(true)}
            />
          ) : hasError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '11px', color: '#64748b' }}>
              <AlertTriangle size={38} style={{ color: '#ef4444' }} />
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>
                No se pudo conectar a la camara.<br />
                <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                  Verifica que el backend este corriendo y la fuente sea correcta:
                </span>
              </p>
              <code style={{
                backgroundColor: '#1e293b', color: '#7dd3fc',
                padding: '4px 11px', borderRadius: '6px', fontSize: '0.73rem'
              }}>{camera.source}</code>
              <button
                onClick={() => { setErr(false); setRetry(value => value + 1); }}
                className="btn btn-outline btn-sm"
                style={{ color: '#60a5fa', borderColor: '#60a5fa' }}
              >
                <RefreshCw size={12} /> Reintentar
              </button>
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Conectando con la cámara...</div>
          )}
          {!hasError && url && (
            <div style={{ position: 'absolute', bottom: 9, left: 9, display: 'flex', gap: '6px' }}>
              <span style={{
                backgroundColor: 'rgba(0,0,0,0.7)', color: '#10b981',
                fontSize: '0.60rem', fontWeight: 700, padding: '2px 8px', borderRadius: '99px'
              }}>
                SEÑAL EN DIRECTO
              </span>
              <span style={{
                backgroundColor: 'rgba(0,0,0,0.7)', color: '#94a3b8',
                fontSize: '0.60rem', padding: '2px 8px', borderRadius: '99px'
              }}>
                {camera.source.slice(0, 40)}{camera.source.length > 40 ? '...' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Monitor Panel ────────────────────────────────────────────────────────────
const MonitorPanel: React.FC<{ cameras: Camera[]; onClose: () => void; showConfidence: boolean }> = ({ cameras, onClose, showConfidence }) => {
  const [cols, setCols] = useState(2);
  const active = cameras.filter(c => c.is_active);

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#0b0f1a',
      zIndex: 9999, display: 'flex', flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 15px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LayoutGrid size={16} style={{ color: '#10b981' }} />
          <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.89rem' }}>
            Monitor Multi-Camara — Cardinova
          </span>
          <span style={{
            backgroundColor: '#10b981', color: '#fff',
            fontSize: '0.60rem', fontWeight: 700, padding: '2px 7px', borderRadius: '99px'
          }}>
            {active.length} CAM
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '0.70rem', color: '#64748b' }}>Columnas:</span>
          {[1, 2, 3, 4].map(n => (
            <button
              key={n} onClick={() => setCols(n)}
              style={{
                width: 24, height: 24, borderRadius: '5px',
                border: cols === n ? '2px solid #10b981' : '1px solid #334155',
                backgroundColor: cols === n ? '#10b98118' : 'transparent',
                color: cols === n ? '#10b981' : '#64748b',
                fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {n}
            </button>
          ))}
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '5px 9px', borderRadius: '5px',
              backgroundColor: '#1e293b', border: '1px solid #334155',
              color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer'
            }}
          >
            <X size={12} /> Cerrar
          </button>
        </div>
      </div>
      <div style={{
        flex: 1, overflow: 'auto', padding: '8px',
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '7px', alignContent: 'start'
      }}>
        {active.map(cam => (
          <div key={cam.id} style={{
            backgroundColor: '#0f172a', borderRadius: '7px',
            overflow: 'hidden', border: '1px solid #1e293b'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '4px 9px', backgroundColor: '#1e293b'
            }}>
              <span style={{ fontSize: '0.67rem', fontWeight: 600, color: '#94a3b8' }}>{cam.name}</span>
              <span style={{ fontSize: '0.59rem', color: '#64748b' }}>{cam.zone}</span>
            </div>
            <div style={{
              backgroundColor: '#000', minHeight: 140,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <MonitorFeed camera={cam} showConfidence={showConfidence} />
            </div>
          </div>
        ))}
        {active.length === 0 && (
          <div style={{
            gridColumn: '1/-1', display: 'flex', alignItems: 'center',
            justifyContent: 'center', minHeight: 280, color: '#475569',
            flexDirection: 'column', gap: 12
          }}>
            <Video size={44} />
            <p>No hay camaras activas registradas</p>
          </div>
        )}
      </div>
    </div>
  );
};

const MonitorFeed: React.FC<{ camera: Camera; showConfidence: boolean }> = ({ camera, showConfidence }) => {
  const [streamError, setStreamError] = useState(false);
  const [retry, setRetry] = useState(0);
  const { url, error: ticketError } = useCameraStreamUrl(camera.id, showConfidence, retry);

  useEffect(() => {
    if (!streamError && !ticketError) return;
    const timer = window.setTimeout(() => {
      setStreamError(false);
      setRetry(value => value + 1);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [streamError, ticketError]);

  if (streamError || ticketError) {
    return <div style={{ color: '#aab4c2', fontSize: '0.76rem' }}>Sin señal de video</div>;
  }

  if (!url) return <div style={{ color: '#aab4c2', fontSize: '0.76rem' }}>Conectando...</div>;

  return (
    <img
      src={url} alt={`Video en directo: ${camera.name}`}
      style={{ width: '100%', display: 'block', objectFit: 'contain' }}
      onError={() => setStreamError(true)}
    />
  );
};

// ── Zone Section ─────────────────────────────────────────────────────────────
const ZoneSection: React.FC<{
  zone: ProductionZone;
  cameras: Camera[];
  testingId: number | null;
  onStream: (c: Camera) => void;
  onEdit: (c: Camera) => void;
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
  isAdmin: boolean;
  onAdd: (zId: string) => void;
  streamingCameraId: number | undefined;
  pauseStreams: boolean;
  showConfidence: boolean;
}> = ({ zone, cameras, testingId, onStream, onEdit, onTest, onDelete, isAdmin, onAdd, streamingCameraId, pauseStreams, showConfidence }) => {
  const [collapsed, setCollapsed] = useState(false);
  const conn = cameras.filter(c => c.is_connected).length;

  return (
    <div style={{
      border: `1px solid ${zone.border}`, borderRadius: '11px',
      overflow: 'hidden', backgroundColor: '#fff'
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          backgroundColor: zone.bg, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%',
            backgroundColor: zone.color,
            boxShadow: conn > 0 ? `0 0 8px ${zone.color}` : 'none'
          }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <h3 style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.90rem', margin: 0 }}>
                {zone.label}
              </h3>
              <span style={{
                backgroundColor: zone.color, color: '#fff',
                fontSize: '0.59rem', padding: '1px 6px', borderRadius: '99px', fontWeight: 700
              }}>
                {zone.stage}
              </span>
            </div>
            <p style={{ fontSize: '0.70rem', color: '#64748b', margin: 0, marginTop: '1px' }}>
              {zone.desc}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
            {cameras.length} cam. · {conn} conectada{conn !== 1 ? 's' : ''}
          </span>
          {collapsed
            ? <ChevronDown size={14} style={{ color: '#64748b' }} />
            : <ChevronUp size={14} style={{ color: '#64748b' }} />
          }
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '13px' }}>
          {cameras.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '26px', color: '#94a3b8',
              fontSize: '0.80rem', border: `2px dashed ${zone.border}`, borderRadius: '8px'
            }}>
              <Video size={24} style={{ marginBottom: '7px', color: zone.border }} />
              <p style={{ margin: '0 0 9px' }}>No hay camaras asignadas a esta zona</p>
              {isAdmin && (
                <button
                  onClick={() => onAdd(zone.id)}
                  className="btn btn-outline btn-sm"
                  style={{ color: zone.color, borderColor: zone.color }}
                >
                  <Plus size={11} /> Agregar camara
                </button>
              )}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
              gap: '11px'
            }}>
              {cameras.map(cam => (
                <CameraCard
                  key={cam.id} cam={cam} testingId={testingId}
                  onStream={onStream} onEdit={onEdit}
                  onTest={onTest} onDelete={onDelete} isAdmin={isAdmin}
                  isStreamPaused={pauseStreams || streamingCameraId === cam.id}
                  showConfidence={showConfidence}
                />
              ))}
              {isAdmin && (
                <div
                  onClick={() => onAdd(zone.id)}
                  style={{
                    border: `2px dashed ${zone.border}`, borderRadius: '9px',
                    minHeight: 140, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', color: zone.color,
                    flexDirection: 'column', gap: '6px', transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = zone.bg)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Plus size={21} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Agregar camara</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main View ─────────────────────────────────────────────────────────────────
export const CamerasView: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('zones');
  const [streamingCamera, setStreamingCamera] = useState<Camera | null>(null);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showConfidence, setShowConfidence] = useState(true);

  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editProto, setEditProto] = useState<ProtocolType>('USB');
  const [editConf, setEditConf] = useState(0.60);
  const [editZone, setEditZone] = useState('DOBLADO_LAMINA');
  const [saving, setSaving] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newZone, setNewZone] = useState('DOBLADO_LAMINA');
  const [newSource, setNewSource] = useState('');
  const [newProto, setNewProto] = useState<ProtocolType>('RTSP');
  const [newConf, setNewConf] = useState(0.60);
  const [creating, setCreating] = useState(false);


  const fetchCameras = useCallback(async () => {
    try {
      setCameras(await getCamerasApi());
    } catch (e: any) {
      setError(e.message || 'Error al cargar las camaras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(fetchCameras); }, [fetchCameras]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void getCamerasApi().then(setCameras).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const handleTest = async (id: number) => {
    setTestingId(id);
    try {
      const u = await testCameraApi(id);
      setCameras(prev => prev.map(c => c.id === id ? u : c));
      showSuccessToast('Prueba de cámara completada.');
    } catch (e: any) {
      showErrorToast(e.message || 'Error al probar la cámara');
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenEdit = (cam: Camera) => {
    setEditingCamera(cam);
    setEditSource(cam.source);
    setEditProto(detectProtocol(cam.source));
    setEditConf(cam.confidence_threshold);
    setEditZone(cam.zone);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCamera) return;
    setSaving(true);
    try {
      const u = await updateCameraApi(editingCamera.id, {
        source: editSource, confidence_threshold: editConf, zone: editZone
      });
      setCameras(prev => prev.map(c => c.id === editingCamera.id ? u : c));
      setEditingCamera(null);
      showSuccessToast('Cámara actualizada correctamente.');
    } catch (e: any) {
      showErrorToast(e.message || 'Error al actualizar la cámara');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createCameraApi({ name: newName, zone: newZone, source: newSource, confidence_threshold: newConf });
      setShowCreate(false);
      setNewName(''); setNewSource(''); setNewConf(0.60); setNewProto('RTSP');
      await fetchCameras();
      showSuccessToast('Cámara creada correctamente.');

    } catch (e: any) {
      showErrorToast(e.message || 'Error al crear la cámara');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    const result = await confirmCameraDeletion();
    if (!result.isConfirmed) return;
    try {
      await deleteCameraApi(id);
      await fetchCameras();
      showSuccessToast('Cámara eliminada correctamente.');
    } catch (e: any) {
      showErrorToast(e.message || 'Error al eliminar la cámara');
    }
  };

  const connected = cameras.filter(c => c.is_connected).length;
  const active = cameras.filter(c => c.is_active).length;
  const disconnectedCameras = cameras.filter(camera => camera.is_active && !camera.is_connected);
  const customZones: ProductionZone[] = Array.from(new Set(
    cameras.map(camera => camera.zone).filter(zoneId => !ZONES.some(zone => zone.id === zoneId))
  )).map(zoneId => ({
    id: zoneId,
    label: zoneId.replace(/_/g, ' '),
    stage: 'Zona adicional',
    color: '#0f766e',
    bg: '#f0fdfa',
    border: '#99f6e4',
    desc: 'Zona personalizada de producción'
  }));
  const cameraZones: ProductionZone[] = [...ZONES, ...customZones];

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header cameras-view-header">
        <div>
          <h2 style={{ fontSize: '1.14rem', fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>
            Gestion de Camaras y Zonas de Produccion
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Conecta cualquier camara (USB, IP, RTSP, Celular) · Asigna zona · Monitorea con YOLO en tiempo real
          </p>
        </div>
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#475569' }}>
            <input
              type="checkbox"
              checked={showConfidence}
              onChange={(e) => setShowConfidence(e.target.checked)}
            />
            Mostrar % de confianza
          </label>
          <div style={{
            display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '7px',
            padding: '2px', border: '1px solid #e2e8f0'
          }}>
            {[['zones', 'Por Zonas'], ['grid', 'Lista']].map(([mode, lbl]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as ViewMode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 9px', borderRadius: '5px', border: 'none',
                  backgroundColor: viewMode === mode ? '#fff' : 'transparent',
                  color: viewMode === mode ? '#0f172a' : '#64748b',
                  fontWeight: viewMode === mode ? 700 : 500,
                  fontSize: '0.71rem', cursor: 'pointer',
                  boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          <button onClick={() => setShowMonitor(true)} className="btn btn-outline btn-sm">
            <Tv size={13} /> Monitor
          </button>
          <button onClick={fetchCameras} className="btn btn-outline btn-sm" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
              <Plus size={13} /> Nueva Camara
            </button>
          )}
        </div>
      </div>

      {disconnectedCameras.length > 0 && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14, border: '1px solid #fecaca', background: '#fff1f2', color: '#9f1239', borderRadius: 6, fontSize: '0.82rem' }}>
          <AlertTriangle size={16} />
          <span>{disconnectedCameras.length} cámara(s) activa(s) sin señal: {disconnectedCameras.map(camera => camera.name).join(', ')}</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: '9px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          ['Total', cameras.length, 'var(--primary)'],
          ['Activas', active, '#66758a'],
          ['Conectadas', connected, '#16a34a'],
          ['Sin senal', active - connected, active - connected > 0 ? '#dc2626' : '#94a3b8']
        ].map(([lbl, val, col]) => (
          <div key={lbl as string} style={{
            backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
            padding: '8px 13px', display: 'flex', alignItems: 'center', gap: '8px',
            flex: '1 1 100px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: col as string, lineHeight: 1 }}>
              {val as number}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{lbl as string}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '7px',
          padding: '8px 13px', marginBottom: '13px', fontSize: '0.80rem',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Zones view */}
      {viewMode === 'zones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {cameraZones.map(zone => (
            <ZoneSection
              key={zone.id} zone={zone}
              cameras={cameras.filter(c => c.zone === zone.id)}
              testingId={testingId}
              onStream={setStreamingCamera} onEdit={handleOpenEdit}
              onTest={handleTest} onDelete={handleDelete}
              isAdmin={isAdmin}
              onAdd={(zId) => { setNewZone(zId); setShowCreate(true); }}
              streamingCameraId={streamingCamera?.id}
              pauseStreams={showMonitor}
              showConfidence={showConfidence}
            />
          ))}
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: '11px' }}>
          {cameras.map(cam => (
            <CameraCard
              key={cam.id} cam={cam} testingId={testingId}
              onStream={setStreamingCamera} onEdit={handleOpenEdit}
              onTest={handleTest} onDelete={handleDelete} isAdmin={isAdmin}
              isStreamPaused={showMonitor || streamingCamera?.id === cam.id}
              showConfidence={showConfidence}
            />
          ))}
          {cameras.length === 0 && !loading && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '55px', color: '#94a3b8' }}>
              <Video size={38} style={{ marginBottom: 11 }} />
              <p>No hay camaras registradas</p>
              {isAdmin && (
                <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ marginTop: 11 }}>
                  <Plus size={13} /> Agregar Primera Camara
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {streamingCamera && <StreamModal camera={streamingCamera} showConfidence={showConfidence} onClose={() => setStreamingCamera(null)} />}
      {showMonitor && <MonitorPanel cameras={cameras} showConfidence={showConfidence} onClose={() => setShowMonitor(false)} />}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '555px' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Plus size={16} style={{ color: 'var(--primary)' }} />
                <h3 className="card-title">Registrar Nueva Camara</h3>
              </div>
              <button onClick={() => setShowCreate(false)} className="btn btn-outline btn-sm">
                <X size={13} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '5px' }}>
                  Nombre Descriptivo *
                </label>
                <input
                  type="text" className="input-control"
                  placeholder="ej. Camara Celular - Zona Doblado"
                  value={newName} onChange={e => setNewName(e.target.value)} required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '5px' }}>
                  Zona de Produccion *
                </label>
                <ZoneSelector value={newZone} onChange={setNewZone} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '6px' }}>
                  Tipo de Conexion y Fuente de Video *
                </label>
                <ProtocolWizard
                  proto={newProto} onProto={setNewProto}
                  source={newSource} onSource={setNewSource}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '5px' }}>
                  Umbral de Confianza YOLO: <strong>{(newConf * 100).toFixed(0)}%</strong>
                </label>
                <input
                  type="range" min="0.10" max="0.95" step="0.05"
                  value={newConf} onChange={e => setNewConf(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '0.66rem', color: '#94a3b8', marginTop: '2px'
                }}>
                  <span>10% (mas detecciones)</span>
                  <span>95% (alta confianza)</span>
                </div>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: '7px',
                paddingTop: '8px', borderTop: '1px solid #f1f5f9'
              }}>
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={creating} className="btn btn-primary">
                  {creating ? 'Registrando...' : 'Registrar Camara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCamera && (
        <div className="modal-overlay" onClick={() => setEditingCamera(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '525px' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Settings size={16} style={{ color: '#66758a' }} />
                <h3 className="card-title">Configurar — {editingCamera.name}</h3>
              </div>
              <button onClick={() => setEditingCamera(null)} className="btn btn-outline btn-sm">
                <X size={13} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '5px' }}>
                  Zona de Produccion
                </label>
                <ZoneSelector value={editZone} onChange={setEditZone} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '6px' }}>
                  Tipo de Conexion y Fuente
                </label>
                <ProtocolWizard
                  proto={editProto} onProto={setEditProto}
                  source={editSource} onSource={setEditSource}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '5px' }}>
                  Umbral de Confianza YOLO: <strong>{(editConf * 100).toFixed(0)}%</strong>
                </label>
                <input
                  type="range" min="0.10" max="0.95" step="0.05"
                  value={editConf} onChange={e => setEditConf(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: '7px',
                paddingTop: '8px', borderTop: '1px solid #f1f5f9'
              }}>
                <button type="button" onClick={() => setEditingCamera(null)} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
