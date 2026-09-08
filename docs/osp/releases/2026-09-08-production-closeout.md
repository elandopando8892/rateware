# Inicio del cierre productivo OSP — 2026-09-08

Autorizacion de trabajo: avanzar hasta produccion. El correo final sigue sujeto
a revision de Sales; no se transforma una firma electronica de desarrollo en
evidencia de firma autografa. Los datos de referencias aportados por el usuario
se mantienen fuera del repositorio.

## Estado comprobado en vivo

- Proyecto compartido: `alqjqzqagdmcywpjtnnr`, `rateware-prod`, saludable, PG 17.6.
- Consulta de solo lectura: `2026-09-08 07:41:00.575302+00`.
- Cero de las nueve versiones de migracion del cierre aparecen en el ledger.
  Esto comprueba versiones exactas; aun se debe conciliar nombres/definiciones
  antes de aplicar migraciones.
- Salientes deshabilitados; modo shadow. Los cron de intake y revision trimestral
  siguen activos. No se modificaron ni se invoco el worker.
- Vercel: `osp.heymarksman.com` sigue apuntando a
  `dpl_Ggf4PYD79X66rfFLipw3kNuj5Fhe`, READY, produccion, fuente `ed12d16`.
- GitHub: `elandopando8892/rateware` es PUBLIC. La rama remota OSP sigue en
  `1291fced0b6d9090a597d0a7b3fa0aea8e52ecc1`.
- La consulta especifica de `elandopando8892/osp-customer-setup` no resuelve
  un repositorio accesible. No se creo otro repositorio ni se cambio visibilidad.

## Candidato aislado

Se creo un worktree limpio en
`D:/andre/apps/codex-data/worktrees/Rateware/osp-production-closeout-20260908`,
rama `codex/osp-production-closeout-20260908`, desde
`dc669d7e61db572155b075b0e4c673630338d616`.

Quedan fuera los cambios preexistentes de ServiceDesk en `osp-read-api` y `tmp/`
del checkout anterior. No se eliminaron ni modificaron esos archivos.

- 46 pruebas Deno enfocadas aprobadas, cero fallos, en contrato, varios
  formularios, frontera del adaptador, controles PDF y vistas Salzillo/Crane.
- Contrato de acciones: 168/168 aprobado directamente en el checkout limpio,
  sin superposiciones de contenido. La primera ejecucion fallo por ausencia
  local de `@babel/parser`; se reutilizo `node_modules` existente mediante una
  junction y se repitio correctamente. No hubo instalacion ni cambio del lock.
- No son pruebas de login real, PDF final, envio ni aceptacion productiva.

## Bloqueo y trabajo pendiente

No publicar este cierre en el remoto publico sin resolver la discrepancia con
la privacidad prevista para OSP. Cambiar Rateware a privado afectaria a otros
productos; no hacerlo como efecto secundario del cierre. Preferir un destino
privado de OSP confirmado antes del push.

Continuan pendientes la vinculacion explicita de artefactos por formulario,
la evidencia de cobertura sobre bytes exactos y el paquete real de Salzillo.
La imagen de firma autorizada para desarrollo no acredita el requisito de
firma autografa. No modificar el caso enviado ni reenviarlo para probar.

No hubo push, despliegue, migracion, cambio de datos o controles productivos,
firma aplicada, correo, webhook ni infraestructura contratada.
