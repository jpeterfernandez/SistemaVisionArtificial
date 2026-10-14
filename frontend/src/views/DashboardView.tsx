import React, { useCallback, useEffect, useState } from 'react';
import { getDashboardStatsApi, getRequestMetricsApi } from '../api/endpoints';
import { ProductionTrendPanel } from '../components/ProductionTrendPanel';
import type { DashboardStats } from '../types';
import type { RequestMetrics } from '../types';
import { useAuth } from '../context/useAuth';
import {
  AlertTriangle,
  RefreshCw,
  Activity,
  Clock3,
} from 'lucide-react';

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Sin registros';
}

export const DashboardView: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [requestMetrics, setRequestMetrics] = useState<RequestMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getDashboardStatsApi();
      setStats(data);
      setSelectedCameraId(current => current ?? data.cameras[0]?.id ?? null);
    } catch (err: any) {
      setError(err.message || 'Error cargando métricas del panel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchStats);
  }, [fetchStats]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let active = true;
    const refreshMetrics = async () => {
      try {
        const metrics = await getRequestMetricsApi();
        if (active) setRequestMetrics(metrics);
      } catch {
        if (active) setRequestMetrics(null);
      }
    };
    void refreshMetrics();
    const timer = window.setInterval(refreshMetrics, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user?.role]);

  if (loading && !stats) {
    return (
      <div className="view-container" style={{ textAlign: 'center', padding: '60px' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        <p style={{ marginTop: '12px', color: '#64748b' }}>Cargando estado operativo del sistema...</p>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="view-container">
        <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} style={{ color: '#dc2626' }} />
            <div>
              <h3 style={{ fontWeight: 600 }}>Error de conexión con el backend</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem' }}>{error}</p>
            </div>
          </div>
          <button onClick={fetchStats} className="btn btn-outline" style={{ marginTop: '16px' }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const s = stats!;
  const selectedCamera = s.cameras.find(camera => camera.id === selectedCameraId);
  const cameraEvents = s.recent_events
    .filter(event => event.camera_id === selectedCameraId)
    .sort((a, b) => new Date(b.event_timestamp).getTime() - new Date(a.event_timestamp).getTime());
  const latestCameraEvent = cameraEvents[0];
  const latestSyncedEvent = cameraEvents.find(event => event.sync_status === 'SINCRONIZADO');

  return (
    <div className="view-container">
      {/* Top action bar */}
      <div className="view-header">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Monitoreo General de Planta</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Eventos productivos, actividad de cámaras e integración ERP
          </p>
        </div>
        <button onClick={fetchStats} className="btn btn-outline btn-sm">
          <RefreshCw size={14} />
          Actualizar datos
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <section className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Activity size={18} style={{ color: '#0f766e' }} />
              <h3 className="card-title">Actividad por cámara</h3>
            </div>
            <select
              className="input-control"
              aria-label="Seleccionar cámara"
              value={selectedCameraId ?? ''}
              onChange={event => setSelectedCameraId(event.target.value ? Number(event.target.value) : null)}
              style={{ width: 'auto', minWidth: '145px', padding: '6px 9px' }}
            >
              {s.cameras.length === 0 && <option value="">Sin cámaras</option>}
              {s.cameras.map(camera => <option key={camera.id} value={camera.id}>Cámara #{camera.id} · {camera.name}</option>)}
            </select>
          </div>
          {!selectedCamera ? (
            <p style={{ color: '#64748b', fontSize: '0.82rem' }}>No hay cámaras registradas.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
              <div>

              {user?.role === 'ADMIN' && requestMetrics && (
                <div className="stats-grid" aria-label="Métricas de disponibilidad de API">
                  <div className="stat-box">
                    <span className="stat-label">Latencia p95 API</span>
                    <span className="stat-value">{requestMetrics.p95_latency_ms.toFixed(0)} ms</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Errores API (muestra reciente)</span>
                    <span className="stat-value" style={{ color: requestMetrics.error_rate_percent > 2 ? '#dc2626' : '#16a34a' }}>
                      {requestMetrics.error_rate_percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.76rem' }}><Clock3 size={14} /> Última actividad</div>
                <strong style={{ display: 'block', fontSize: '0.84rem', marginTop: '5px' }}>{formatDateTime(selectedCamera.last_detection_at)}</strong>
                <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{latestCameraEvent ? `${latestCameraEvent.stage} · ${latestCameraEvent.event_type}` : 'Sin detalle de evento reciente'}</span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.76rem' }}><RefreshCw size={13} /> Último evento sincronizado</div>
                <strong style={{ display: 'block', fontSize: '0.84rem', marginTop: '5px' }}>{formatDateTime(latestSyncedEvent?.event_timestamp)}</strong>
                <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{latestSyncedEvent ? `${latestSyncedEvent.stage} · ${latestSyncedEvent.order_name || 'Sin orden asociada'}` : 'No hay eventos sincronizados para esta cámara'}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Production KPIs */}
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-label">Órdenes Totales</span>
          <span className="stat-value">{s.total_orders}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">En Progreso</span>
          <span className="stat-value" style={{ color: 'var(--primary)' }}>{s.in_progress_orders}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Detecciones Hoy</span>
          <span className="stat-value">{s.total_detections_today}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Eventos Confirmados Hoy</span>
          <span className="stat-value" style={{ color: '#16a34a' }}>{s.total_events_today}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Pendientes de Asociación</span>
          <span className="stat-value" style={{ color: s.pending_association_events_count > 0 ? '#d97706' : '#64748b' }}>
            {s.pending_association_events_count}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Pendientes de Sync Odoo</span>
          <span className="stat-value" style={{ color: s.pending_sync_events_count > 0 ? '#d97706' : '#64748b' }}>
            {s.pending_sync_events_count}
          </span>
        </div>
      </div>

      <ProductionTrendPanel />

      {/* Grid: Cameras & Stage Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Cameras Status */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h3 className="card-title">Zonas de Monitoreo Productivo</h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>3 Cámaras independientes</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {s.cameras.map((cam) => (
              <div
                key={cam.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{cam.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Zona: <strong>{cam.zone}</strong> | Umbral: {(cam.confidence_threshold * 100).toFixed(0)}%
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${cam.is_connected ? 'badge-success' : 'badge-info'}`}>
                    {cam.is_connected ? 'Transmisión activa' : 'Configurada'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stage Distribution */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <h3 className="card-title">Distribución por Etapas Registradas</h3>
          </div>
          {s.stage_distribution.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.9rem' }}>
              No se han registrado eventos de etapas en la base de datos aún.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {s.stage_distribution.map((item) => (
                <div key={item.stage}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600 }}>{item.stage}</span>
                    <span style={{ color: '#64748b' }}>{item.count} eventos</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        backgroundColor: 'var(--primary)',
                        width: `${Math.min(100, item.count * 10)}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Confirmed Events */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Eventos Recientes Confirmados</h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Últimos eventos generados</span>
        </div>

        {s.recent_events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontSize: '0.9rem' }}>
            No hay eventos confirmados registrados. Utilice la sección de <strong>Visión Artificial</strong> para enviar capturas de prueba.
          </div>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Fecha/Hora (UTC)</th>
                  <th>Etapa Detectada</th>
                  <th>Cámara / Zona</th>
                  <th>Confianza</th>
                  <th>Orden Asociada</th>
                  <th>Estado Asociación</th>
                  <th>Sync Odoo</th>
                </tr>
              </thead>
              <tbody>
                {s.recent_events.map((ev) => (
                  <tr key={ev.id}>
                    <td>{new Date(ev.event_timestamp).toLocaleString()}</td>
                    <td><strong>{ev.stage}</strong></td>
                    <td>{ev.camera_name || `Cámara #${ev.camera_id}`}</td>
                    <td>{(ev.confidence * 100).toFixed(1)}%</td>
                    <td>{ev.order_name || 'Sin orden asignada'}</td>
                    <td>
                      <span className={`badge ${
                        ev.association_status === 'ASOCIADO' ? 'badge-success' : 'badge-warning'
                      }`}>
                        {ev.association_status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${
                        ev.sync_status === 'SINCRONIZADO' ? 'badge-success' : 'badge-info'
                      }`}>
                        {ev.sync_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
