# Compatibilidad E3: varias solicitudes del mismo lead

## Publicación autorizada 25-oct-2026

El parche se integró sobre main `ae0dbfeb`, en `a20455b4`; el contrato acotado se concilió en `ec27ec60`. `rateware-api` pasó de718 a719. La publicación preservó los36 archivos recuperados del runtime718 y sustituyó exclusivamente `rfx-rfi-link.mjs`; lectura posterior confirmó paridad36/36. El main Git tenía tres diferencias previas respecto del runtime (index, team-roles y markos-snapshot); ninguna fue sobrescrita ni importada al Git como parte de E3.

Ocho pruebas de receptor pasan, y la validación de sus tres superficies no reporta errores tras actualizar sólo su fingerprint al corte main. El contrato Deno del handler real pasa con Auth/workspace sintéticos actuales y cliente por petición; su fixture anterior no incluía el proveedor Supabase requerido por el corte vigente. Se ejecutó `--cached-only --no-check --allow-env`: la comprobación de tipos quedó sin ejecutar porque este checkout no resuelve @types/node. No se debilitaron permisos de producto.

La migración de revisión humana pertenece a Radar. La aceptación productiva E3 se documenta en el repositorio de Radar, sin correo, consumo de créditos ni leads reales. El texto siguiente conserva la preparación local histórica.

Cambio local mínimo solicitado como parte de continuar E3 en Demand Radar, sin correos, créditos ni leads reales. No se publicó, no hay migración ni cambio de configuración.

El receptor aceptaba sólo la primera selección privada por dueño/lead. La nueva referencia opcional `radar_after_requirement_id` selecciona la sucesora estable y exige su coincidencia con el recibo; aprobación, operación, proyecto, shipper, permiso de workspace y RPC atómico siguen siendo obligatorios. No acepta una identidad/origen libre desde el navegador. La clave del primer Spot permanece igual.

Pruebas Node24.21.0: `node --test tests/rfx-rfi-link.test.mjs tests/radar-rfi-action-contract.test.mjs`:9 pasan,0 fallan. Se actualizó sólo la huella de autorización de `edge.rateware-api.create_rfx_rfi_magic_link`, tras revisar el cambio de selección; no se refrescó el registro completo. Radar ejecutó además el código de este receptor junto con su escritor/ledger simulado: dos solicitudes con orígenes independientes y bloqueo de referencia a un proyecto distinto, cero llamadas reales.

Esta copia tiene HEAD59337fab, histórico. La lectura actual mostró rateware-api717. **No desplegar este checkout completo**: integrar exclusivamente este parche sobre la base viva y revisar el contrato en esa base antes de una publicación autorizada. Orden de release: Rateware receptor, Radar backend, Radar frontend. El borrado, creación o publicación de enlaces/cargas reales quedan fuera de esta prueba.

Fuente detallada: `D:/andre/repos/marksman-acceptance-hotfixes/docs/E3-MULTIPLE-REQUESTS-LOCAL-2026-10-25.md`. No se afirma suite completa de Rateware ni aceptación productiva.
