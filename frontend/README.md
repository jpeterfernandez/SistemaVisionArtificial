# Cardinova - Frontend de Control de Producción

Panel de control web industrial minimalista desarrollado con **React 19**, **TypeScript**, **Vite** y **Lucide React**.

## 1. Instalación y Dependencias

```bash
npm install
```

## 2. Configuración (.env)

Copia `.env.example` a `.env`:
```bash
cp .env.example .env
```

Parámetro:
- `VITE_API_URL`: URL base del API backend (por defecto `http://localhost:8000/api/v1`).

## 3. Ejecución en Desarrollo

```bash
npm run dev
```

La aplicación se iniciará en `http://localhost:5173`.

## 4. Compilación para Producción

```bash
npm run build
```

Genera los archivos estáticos en la carpeta `dist/`.

## 5. Módulos y Vistas

1. **Inicio de Sesión**: Autenticación JWT y control de acceso RBAC.
2. **Panel General**: Monitoreo de servicios (PostgreSQL, YOLO, Odoo, Cámaras) y métricas de producción en tiempo real.
3. **Producción**: Gestión de órdenes de trabajo, seguimiento de etapas y cálculo de tiempos.
4. **Visión Artificial**: Pruebas de inferencia con carga de imágenes y visualización de bounding boxes y clases reales.
5. **Cámaras y Zonas**: Diagnóstico y configuración de las 3 zonas de cámara independientes.
6. **Eventos e Historial**: Registro trazable con filtros y asociación controlada a órdenes.
7. **Integración Odoo**: Prueba de conectividad ERP y sincronización de órdenes y eventos.
8. **Configuración**: Mapeo dinámico de etapas y parámetros de inferencia (solo rol ADMIN).
9. **Usuarios y Auditoría**: Asignación de roles/zonas y consulta de cambios administrativos (solo rol ADMIN).

ADMIN tiene acceso global. OPERATOR y VIEWER solo consultan las zonas asignadas; OPERATOR puede ejecutar acciones operativas dentro de esas zonas y VIEWER tiene acceso de lectura. Las exportaciones CSV aplican el mismo alcance del backend.
