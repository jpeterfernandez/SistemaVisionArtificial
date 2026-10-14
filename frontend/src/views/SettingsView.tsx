import React, { useState, useEffect, useCallback } from 'react';
import {
  getSettingsApi,
  updateSettingApi,
  getYoloRuntimeConfigurationApi,
  updateYoloRuntimeConfigurationApi,
  getYoloRuntimeMetricsApi
} from '../api/endpoints';
import type { SystemSetting, YoloRuntimeConfiguration, YoloRuntimeMetrics, YoloRuntimeStatus } from '../types';
import { Save, RefreshCw, ShieldAlert, Cpu, SlidersHorizontal, Link2, Activity } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/useAuth';
import { showErrorToast, showSuccessToast } from '../utils/notifications';

const ODOO_SETTING_KEY = 'ODOO_INTEGRATION_ENABLED';

function isSettingEnabled(setting: SystemSetting | undefined): boolean {
  return ['true', '1', 'si', 'sí', 'enabled'].includes((setting?.value || '').trim().toLowerCase());
}

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const [settingsList, setSettingsList] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<YoloRuntimeStatus | null>(null);
  const [runtimeConfiguration, setRuntimeConfiguration] = useState<YoloRuntimeConfiguration | null>(null);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [runtimeMetrics, setRuntimeMetrics] = useState<YoloRuntimeMetrics[]>([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await getSettingsApi();
      setSettingsList(data);
      const map: Record<string, string> = {};
      data.forEach(s => {
        map[s.key] = s.value;
      });
      setEditingValues(map);
      const runtime = await getYoloRuntimeConfigurationApi();
      setRuntimeStatus(runtime);
      setRuntimeConfiguration(runtime.configuration || null);
    } catch (err: any) {
      showErrorToast(err.message || 'Error cargando configuración del sistema');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      void Promise.resolve().then(fetchSettings);
    }
  }, [user?.role, fetchSettings]);

  useEffect(() => {
    if (!runtimeStatus?.enabled) return;

    let active = true;
    let fetching = false;
    const fetchMetrics = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const metrics = await getYoloRuntimeMetricsApi();
        if (active && metrics.enabled) {
          setRuntimeMetrics(current => [...current, { ...metrics, captured_at: new Date().toISOString() }].slice(-60));
          setMetricsError(null);
        }
      } catch (error: any) {
        if (active) setMetricsError(error.message || 'No se pudieron consultar las métricas.');
      } finally {
        fetching = false;
      }
    };

    fetchMetrics();
    const interval = window.setInterval(fetchMetrics, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [runtimeStatus?.enabled]);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    try {
      await updateSettingApi(key, editingValues[key]);
      showSuccessToast(`Configuración '${key}' guardada exitosamente.`);
    } catch (err: any) {
      showErrorToast(err.message || 'Error guardando configuración');
    } finally {
      setSavingKey(null);
    }
  };

  const odooSetting = settingsList.find(setting => setting.key.toLowerCase() === ODOO_SETTING_KEY.toLowerCase());
  const odooEnabled = isSettingEnabled(odooSetting);

  const handleOdooToggle = async (enabled: boolean) => {
    setSavingKey(ODOO_SETTING_KEY);
    try {
      const updated = await updateSettingApi(
        odooSetting?.key || ODOO_SETTING_KEY,
        enabled ? 'true' : 'false',
        odooSetting?.description || 'Controla si el sistema utiliza la integración con Odoo.'
      );
      setSettingsList(current => [
        ...current.filter(setting => setting.key.toLowerCase() !== ODOO_SETTING_KEY.toLowerCase()),
        updated
      ]);
      showSuccessToast(`Integración con Odoo ${enabled ? 'activada' : 'desactivada'}.`);
    } catch (err: any) {
      showErrorToast(err.message || 'Error actualizando la integración con Odoo');
    } finally {
      setSavingKey(null);
    }
  };

  const handleRuntimeSave = async () => {
    if (!runtimeConfiguration) return;
    setSavingRuntime(true);
    try {
      const updated = await updateYoloRuntimeConfigurationApi(runtimeConfiguration);
      setRuntimeStatus(updated);
      setRuntimeConfiguration(updated.configuration || runtimeConfiguration);
      showSuccessToast(`YOLO aplicó la configuración en ${updated.active?.device || 'el dispositivo seleccionado'}.`);
    } catch (err: any) {
      showErrorToast(err.message || 'Error aplicando la configuración de YOLO');
    } finally {
      setSavingRuntime(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="view-container settings-view">
        <div className="settings-restricted">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert size={24} style={{ color: '#d97706' }} />
            <div>
              <h3 style={{ fontWeight: 600 }}>Acceso Restringido</h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                Solo los usuarios con rol <strong>ADMIN</strong> tienen autorización para modificar los parámetros globales del sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container settings-view">
      <header className="settings-hero">
        <div className="settings-hero-copy">
          <span className="settings-eyebrow"><SlidersHorizontal size={14} /> Administración</span>
          <h1>Configuración del sistema</h1>
          <p>Gestiona integraciones, parámetros de inferencia y detalles de la plataforma.</p>
        </div>
        <button onClick={() => { setLoading(true); void fetchSettings(); }} disabled={loading} className="settings-refresh">
          <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          Recargar ajustes
        </button>
      </header>

      <div className="settings-content">
        <section className="settings-section" aria-labelledby="settings-integrations-title">
          <div className="settings-section-heading">
            <span className="settings-icon"><Link2 size={18} /></span>
            <div>
              <span className="settings-kicker">Conexiones</span>
              <h2 id="settings-integrations-title">Integraciones</h2>
            </div>
          </div>
          <div className="settings-integration-row">
            <div className="settings-row-copy">
              <strong>Odoo ERP</strong>
              <span>Permite sincronizar órdenes y eventos con la plataforma ERP.</span>
            </div>
            <div className="settings-integration-control">
              <span className={`settings-status ${odooEnabled ? 'is-enabled' : ''}`}>
                <span />{odooEnabled ? 'Activa' : 'Inactiva'}
              </span>
              <label className="settings-switch-label">
                <span className="settings-visually-hidden">Permitir integración con Odoo ERP</span>
                <input
                  className="settings-switch"
                  type="checkbox"
                  checked={odooEnabled}
                  disabled={loading || savingKey === ODOO_SETTING_KEY}
                  onChange={event => handleOdooToggle(event.target.checked)}
                  aria-label="Permitir integración con Odoo ERP"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-parameters-title">
          <div className="settings-section-heading">
            <span className="settings-icon"><Cpu size={18} /></span>
            <div>
              <span className="settings-kicker">Plataforma</span>
              <h2 id="settings-parameters-title">Parámetros del sistema</h2>
            </div>
          </div>
          {settingsList.filter(st => !st.key.toUpperCase().startsWith('ODOO_')).length === 0 && !loading ? (
            <div className="settings-empty">No hay parámetros configurables disponibles.</div>
          ) : (
            <div className="settings-parameter-list">
              {settingsList.filter(st => !st.key.toUpperCase().startsWith('ODOO_')).map(st => (
                <article key={st.key} className="settings-parameter">
                  <div className="settings-parameter-heading">
                    <div className="settings-row-copy">
                      <h3>{st.key}</h3>
                      <span>{st.description || 'Sin descripción'}</span>
                    </div>
                    <time dateTime={st.updated_at} className="settings-updated">
                      Actualizado {new Date(st.updated_at).toLocaleString()}
                    </time>
                  </div>
                  <div className="settings-editor">
                    <textarea
                      className="input-control settings-textarea"
                      rows={3}
                      aria-label={`Valor para ${st.key}`}
                      value={editingValues[st.key] || ''}
                      onChange={event => setEditingValues({ ...editingValues, [st.key]: event.target.value })}
                    />
                    <button
                      onClick={() => handleSave(st.key)}
                      disabled={savingKey === st.key}
                      className="btn settings-save"
                    >
                      {savingKey === st.key ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                      Guardar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {runtimeStatus?.enabled && runtimeStatus.hardware && runtimeConfiguration && (
          <section className="settings-section" aria-labelledby="settings-yolo-runtime-title">
            <div className="settings-section-heading">
              <span className="settings-icon"><Cpu size={18} /></span>
              <div>
                <span className="settings-kicker">Solo desarrollo</span>
                <h2 id="settings-yolo-runtime-title">Recursos de visión artificial</h2>
              </div>
            </div>
            <div className="settings-runtime-content">
              <div className="settings-metrics-heading">
                <div>
                  <strong>Consumo y rendimiento del backend</strong>
                  <span>Actualización cada 5 segundos · últimas 5 minutos</span>
                </div>
                <Activity size={18} aria-hidden="true" />
              </div>
              {runtimeMetrics.length > 0 && (() => {
                const latest = runtimeMetrics[runtimeMetrics.length - 1];
                const chartData = runtimeMetrics.map((sample, index) => ({
                  ...sample,
                  sample: index,
                  time: sample.captured_at ? new Date(sample.captured_at).toLocaleTimeString() : '',
                  gpu_memory_percent: sample.gpu_memory_allocated_mb != null && sample.gpu_memory_total_mb
                    ? sample.gpu_memory_allocated_mb / sample.gpu_memory_total_mb * 100
                    : null,
                }));
                return (
                  <>
                    <div className="settings-metrics-summary">
                      <div><span>CPU del proceso</span><strong>{latest.process_cpu_percent?.toFixed(1) ?? '--'}%</strong></div>
                      <div><span>RAM del proceso</span><strong>{latest.process_memory_mb?.toFixed(0) ?? '--'} MB</strong></div>
                      <div><span>VRAM YOLO</span><strong>
                        {latest.gpu_memory_allocated_mb == null ? 'No disponible' : `${latest.gpu_memory_allocated_mb.toFixed(0)} / ${latest.gpu_memory_total_mb?.toFixed(0) ?? '--'} MB`}
                      </strong></div>
                      <div><span>Inferencia promedio</span><strong>{latest.inference_average_ms == null ? '--' : `${latest.inference_average_ms.toFixed(1)} ms`}</strong></div>
                    </div>
                    <div className="settings-metrics-chart" role="img" aria-label="Gráfico de CPU, RAM y VRAM del backend durante los últimos cinco minutos">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 14, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke="#e5e9ec" strokeDasharray="3 5" vertical={false} />
                          <XAxis dataKey="sample" tickFormatter={(_, index) => chartData[index]?.time || ''} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                          <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                          <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.time || ''} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="process_cpu_percent" name="CPU backend" stroke="#087e91" strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="process_memory_percent" name="RAM backend" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
                          {latest.gpu_memory_allocated_mb != null && <Line type="monotone" dataKey="gpu_memory_percent" name="VRAM YOLO" stroke="#16a34a" strokeWidth={2} dot={false} isAnimationActive={false} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="settings-metrics-footnote">
                      {latest.inference_samples
                        ? `Latencia de inferencia: última ${latest.inference_last_ms?.toFixed(1) ?? '--'} ms · promedio de ${latest.inference_samples} inferencias recientes.`
                        : 'Aún no hay inferencias registradas desde que inició el backend.'}
                      {metricsError && <span role="status"> {metricsError}</span>}
                    </div>
                  </>
                );
              })()}
              {runtimeMetrics.length === 0 && (
                <div className="settings-metrics-empty" role="status">
                  {metricsError || 'Esperando la primera lectura de recursos del backend...'}
                </div>
              )}
              <div className="settings-runtime-warning" role="note">
                <ShieldAlert size={19} />
                <div>
                  <strong>Configuración experimental</strong>
                  <span>Al cambiar CPU/GPU se recarga YOLO y las transmisiones pueden pausarse brevemente. En producción este control y su API están deshabilitados.</span>
                </div>
              </div>

              <div className="settings-runtime-grid">
                <label className="settings-runtime-field">
                  <span>Procesador</span>
                  <select
                    className="input-control"
                    value={runtimeConfiguration.device_mode}
                    onChange={event => setRuntimeConfiguration({
                      ...runtimeConfiguration,
                      device_mode: event.target.value as YoloRuntimeConfiguration['device_mode']
                    })}
                    disabled={savingRuntime}
                  >
                    <option value="auto">Automático</option>
                    <option value="cpu">CPU</option>
                    <option value="gpu" disabled={!runtimeStatus.hardware.cuda_available}>GPU CUDA</option>
                  </select>
                  <small>Automático usa CUDA solo si PyTorch detecta una GPU NVIDIA compatible; la Intel Iris Xe se procesa por CPU.</small>
                </label>

                <label className="settings-runtime-field">
                  <span>Hilos CPU</span>
                  <input
                    className="input-control"
                    type="number"
                    min={1}
                    max={runtimeStatus.hardware.cpu_logical_cores}
                    value={runtimeConfiguration.cpu_threads}
                    onChange={event => setRuntimeConfiguration({
                      ...runtimeConfiguration,
                      cpu_threads: Number(event.target.value)
                    })}
                    disabled={savingRuntime}
                  />
                  <small>{runtimeStatus.hardware.cpu_logical_cores} núcleos lógicos detectados.</small>
                </label>

                {(runtimeConfiguration.device_mode === 'gpu' || (runtimeConfiguration.device_mode === 'auto' && runtimeStatus.hardware.cuda_available)) && (
                  <label className="settings-runtime-field">
                    <span>Límite de memoria GPU</span>
                    <div className="settings-runtime-range">
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={5}
                        value={Math.round(runtimeConfiguration.gpu_memory_fraction * 100)}
                        onChange={event => setRuntimeConfiguration({
                          ...runtimeConfiguration,
                          gpu_memory_fraction: Number(event.target.value) / 100
                        })}
                        disabled={savingRuntime}
                      />
                      <output>{Math.round(runtimeConfiguration.gpu_memory_fraction * 100)}%</output>
                    </div>
                    <small>Tope de memoria CUDA para este proceso.</small>
                  </label>
                )}

                <label className="settings-runtime-field">
                  <span>Resolución del stream</span>
                  <select
                    className="input-control"
                    value={runtimeConfiguration.stream_img_size}
                    onChange={event => setRuntimeConfiguration({
                      ...runtimeConfiguration,
                      stream_img_size: Number(event.target.value)
                    })}
                    disabled={savingRuntime}
                  >
                    {[320, 416, 512, 640].map(size => <option key={size} value={size}>{size}px</option>)}
                  </select>
                  <small>320 px reduce la latencia en CPU; sube la resolución si necesitas detectar objetos pequeños.</small>
                </label>
              </div>

              <div className="settings-runtime-hardware">
                <strong>Hardware detectado</strong>
                <span>CPU: {runtimeStatus.hardware.cpu_logical_cores} núcleos lógicos</span>
                {runtimeStatus.hardware.cuda_available
                  ? runtimeStatus.hardware.gpus.map(gpu => (
                    <span key={gpu.index}>GPU {gpu.index}: {gpu.name} · {gpu.free_memory_mb} MB libres de {gpu.total_memory_mb} MB</span>
                  ))
                  : <span>{runtimeStatus.hardware.gpu_unavailable_reason || 'No hay GPU CUDA compatible.'}</span>}
              </div>

              <div className="settings-runtime-footer">
                <span>Activo: {runtimeStatus.active?.device.toUpperCase() || 'desconocido'} · {runtimeStatus.active?.device_reason}</span>
                <button
                  type="button"
                  onClick={handleRuntimeSave}
                  disabled={savingRuntime || !runtimeConfiguration.cpu_threads}
                  className="btn settings-save"
                >
                  {savingRuntime ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  Aplicar recursos
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="settings-environment" aria-labelledby="settings-environment-title">
          <div className="settings-environment-heading">
            <Cpu size={17} />
            <h2 id="settings-environment-title">Información del entorno</h2>
          </div>
          <dl className="settings-environment-grid">
            <div><dt>Versión del sistema</dt><dd>1.0.0</dd></div>
            <div><dt>Backend</dt><dd>FastAPI + SQLAlchemy 2.0</dd></div>
            <div><dt>Base de datos</dt><dd>PostgreSQL 15 (Docker)</dd></div>
            <div><dt>Motor de inferencia</dt><dd>Ultralytics YOLO26m</dd></div>
            <div><dt>Frontend</dt><dd>React 19 + Vite + TypeScript</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
};
