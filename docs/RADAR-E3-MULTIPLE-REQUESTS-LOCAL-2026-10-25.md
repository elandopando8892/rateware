# Compatibilidad E3: varias solicitudes del mismo lead

Cambio local mínimo solicitado como parte de continuar E3 en Demand Radar, sin correos, créditos ni leads reales. No se publicó, no hay migración ni cambio de configuración.

El receptor aceptaba sólo la primera selección privada por dueño/lead. La nueva referencia opcional `radar_after_requirement_id` selecciona la sucesora estable y exige su coincidencia con el recibo; aprobación, operación, proyecto, shipper, permiso de workspace y RPC atómico siguen siendo obligatorios. No acepta una identidad/origen libre desde el navegador. La clave del primer Spot permanece igual.

Pruebas Node24.21.0: `node --test tests/rfx-rfi-link.test.mjs tests/radar-rfi-action-contract.test.mjs`:9 pasan,0 fallan. Se actualizó sólo la huella de autorización de `edge.rateware-api.create_rfx_rfi_magic_link`, tras revisar el cambio de selección; no se refrescó el registro completo. Radar ejecutó además el código de este receptor junto con su escritor/ledger simulado: dos solicitudes con orígenes independientes y bloqueo de referencia a un proyecto distinto, cero llamadas reales.

Esta copia tiene HEAD59337fab, histórico. La lectura actual mostró rateware-api717. **No desplegar este checkout completo**: integrar exclusivamente este parche sobre la base viva y revisar el contrato en esa base antes de una publicación autorizada. Orden de release: Rateware receptor, Radar backend, Radar frontend. El borrado, creación o publicación de enlaces/cargas reales quedan fuera de esta prueba.

Fuente detallada: `D:/andre/repos/marksman-acceptance-hotfixes/docs/E3-MULTIPLE-REQUESTS-LOCAL-2026-10-25.md`. No se afirma suite completa de Rateware ni aceptación productiva.
