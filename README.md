# SAP Notes Control Center

Sistema web de seguimiento de implementación de Notas SAP para equipos SAP BASIS.

**App:** https://antoniolopezlabra-boop.github.io/dxc-sap-notes/

## Qué resuelve

Los administradores BASIS reciben notas de seguridad (reportes de vulnerabilidades)
que deben implementar en todos los ambientes de sus landscapes (DEV → QA → PRE → SBX → PRD),
con múltiples flujos de autorización intermedios. Este sistema reemplaza el seguimiento
manual en Excel y evita que las notas se pierdan de vista: cada paso estancado se marca
con un semáforo de demora (5 días amarillo, 10 naranja, 15+ rojo).

## Roles

| Rol | Capacidades |
|---|---|
| **Súper usuario** | Panorama global + consola de usuarios (altas, bloqueos, contraseñas, traspaso de grupos) |
| **Supervisor** | Panorama global de todo el equipo, solo lectura |
| **Administrador** | Solo ve sus propios sistemas y notas (aislado por RLS) |

## Flujo de implementación por track

1. Evaluación en SNOTE (¿aplica? — si no: evidencia + motivo y finaliza)
2. Implementación en Desarrollo → captura de Orden de Transporte (OT)
3. Solicitud de SAROX (TQS → cliente)
4. SAROX en short description + liberación de la OT
5. VoBo y KIT para Calidad → implementación en QA + evidencia
6. VoBo, KIT y QA Approval (STMS) para Pre Producción → implementación
7. VoBo final → Sandbox y/o Producción

Los pasos se generan dinámicamente según los ambientes que tenga cada grupo de sistemas.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS v4 + Recharts (SPA, GitHub Pages)
- **Backend:** Supabase — Postgres con Row Level Security, Auth (signup deshabilitado,
  solo el súper usuario da de alta), Storage privado para evidencias, Edge Function
  `admin-users` para la consola de gestión
- La anon key incluida en el bundle es pública por diseño; toda la autorización se
  aplica en el servidor vía políticas RLS y verificación de rol en la Edge Function.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
```

Deploy: push del contenido de `dist/` a la rama `gh-pages`.
