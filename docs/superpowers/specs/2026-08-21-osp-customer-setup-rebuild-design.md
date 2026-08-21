# OSP Customer Setup Rebuild — Diseño

**Fecha:** 2026-08-21

**Estado:** aprobado para especificación

**Producto:** Onboarding Service Provider (OSP) — XBF Customer Setup

## 1. Propósito

Construir OSP como una aplicación independiente para gestionar solicitudes en las que un carrier o proveedor pide que XBF se registre como cliente suyo.

El flujo empieza cuando una persona de XBF responde o escribe al proveedor y pone a `carriers@xbfreight.com` en copia. OSP captura esa copia, conserva el correo y los adjuntos, prepara la información solicitada, completa los formularios, obtiene la aprobación y firma de José Andrés González Perales, obtiene la autorización de respuesta de Sales y finalmente responde desde `carriers@xbfreight.com` dentro del hilo original.

OSP no es un producto de cotizaciones ni un proceso para dar de alta proveedores dentro de XBF.

## 2. Definición del producto

### 2.1 Incluido

- Captura de solicitudes por copia a `carriers@xbfreight.com`.
- Identificación del proveedor y enlace con el registro de Carrier CRM.
- Clasificación de la solicitud como `customer_setup`.
- Pipeline CRM para administrar cada alta de XBF ante un proveedor.
- Preservación del correo, hilo y archivos originales.
- Análisis de PDF, XLSX, DOCX, XLS, DOC e imágenes admitidas.
- Detección de campos, documentos e información solicitada en el cuerpo y adjuntos.
- Recuperación controlada de datos y documentos corporativos desde el Entity Vault de XBF.
- Revisión humana de campos, evidencia, excepciones y datos restringidos.
- Ensamble de formularios y paquetes versionados.
- Aprobación y firma gráfica exclusiva de `jgonzalez@xbfreight.com`.
- Autorización de respuesta exclusiva de `sales@heymarksman.com`.
- Respuesta desde `carriers@xbfreight.com` en el hilo original.
- Seguimiento hasta confirmación o cierre del caso.
- Auditoría integral de cada decisión y artefacto.

### 2.2 Excluido

- Interpretación de cotizaciones o tarifas.
- Inserciones en `rate_staging` o el rate book.
- Onboarding de carriers como proveedores de XBF.
- Portal externo de autoservicio para el proveedor.
- Firma autónoma, autorización autónoma o envío autónomo.
- Firma electrónica avanzada basada en certificado, e.firma del SAT o proveedor externo de e-signature en la primera entrega.
- Conversión automática de formatos heredados XLS o DOC.

### 2.3 Significado de “firma digital” en esta entrega

La firma es una firma electrónica gráfica basada en la imagen PNG proporcionada por el usuario a nombre de José Andrés González Perales. No representa una firma electrónica avanzada con certificado.

El activo se provisionará fuera de Git en almacenamiento privado de OSP. El navegador nunca recibirá el archivo original. La aplicación sólo podrá aplicarlo después de una acción autenticada y explícita de `jgonzalez@xbfreight.com` sobre una revisión exacta e inmutable del paquete.

## 3. Actores y separación de facultades

| Actor | Facultades | Prohibiciones |
|---|---|---|
| Operador OSP | Consultar casos, corregir enlaces, revisar extracción, resolver campos y preparar paquetes | No puede firmar, autorizar la respuesta ni enviar |
| `jgonzalez@xbfreight.com` | Aprobar y aplicar la firma de José Andrés González Perales al paquete exacto | No autoriza ni envía la respuesta por esa sola facultad |
| `sales@heymarksman.com` | Autorizar destinatarios, cuerpo y adjuntos exactos de la respuesta | No puede aplicar la firma ni cambiar el paquete firmado |
| `carriers@xbfreight.com` | Capturar mensajes en CC y enviar la respuesta autorizada mediante Gmail | No revisa, aprueba ni firma |
| Superagente OSP | Clasificar, relacionar, extraer, proponer respuestas y preparar borradores | Nunca aprueba, firma, autoriza o envía por sí mismo |

Las facultades se validan en el backend con el identificador estable del usuario de Kinde y su correo verificado. Ocultar un botón en el frontend no constituye autorización.

## 4. Línea base y estrategia de integración

La entrega OSP fue reconstruida desde `OSP-entrega-20260820.zip`. El bundle y la rama local `feat/provider-service-onboarding-production` coinciden en `c4bea07`.

La línea base entregada declara:

- 73 commits.
- 168 archivos modificados.
- 97 suites.
- 660 pruebas exitosas.
- Contrato de acciones sin errores.
- Runtime OSP separado en `supabase/functions/provider-onboarding-api`.

La implementación no aplicará el diff del ZIP sobre el checkout sucio actual. Se ejecutará desde una base limpia que contenga la historia OSP y la migración vigente de `origin/main`. Antes de integrar se resolverá explícitamente el conflicto de las seis migraciones reconciliadas; cuando ambos cuerpos sean equivalentes se conservará la variante comentada.

## 5. Tecnología elegida

### 5.1 Frontend

- React con TypeScript.
- Vite como servidor de desarrollo y compilador de activos estáticos.
- TanStack Router para rutas tipadas bajo `/app`.
- TanStack Query para consultas, caché, invalidación y mutaciones del estado remoto.
- React Hook Form y Zod para formularios y validación de payloads.
- CSS modular por feature con tokens visuales OSP; sin framework general de componentes en la primera entrega.
- Vitest y React Testing Library para pruebas de unidades de interfaz.
- Playwright para pruebas de navegador.

La aplicación será una SPA autenticada. No requiere SSR porque todas las superficies son privadas y el backend ya existe en Supabase.

### 5.2 Backend y datos

- Supabase Postgres como fuente de verdad.
- Supabase Storage privado para mensajes, adjuntos, documentos del Entity Vault, paquetes y firma.
- Supabase Edge Functions en TypeScript/Deno para API, Gmail, procesamiento documental y ensamble.
- Kinde con Authorization Code + PKCE para autenticación del frontend.
- Gmail API y Gmail push/Pub/Sub para captura y respuesta.

Se preservarán las funciones OSP entregadas:

- `provider-onboarding-api`
- `provider-gmail-intake-api`
- `provider-gmail-oauth-callback`
- `provider-gmail-push`
- `provider-entity-document-processor`
- `provider-document-canary-processor`
- `provider-release-package-api`

El frontend nuevo reemplazará el shell multipágina con iframes. Las páginas HTML heredadas permanecerán disponibles sólo durante la migración y se retirarán cuando cada ruta React alcance paridad verificada.

## 6. Despliegue y autenticación

### 6.1 URL de OSP

- Aplicación: `https://osp.heymarksman.com/app`
- Base de rutas Vite: `/app/`
- Rutas internas: `/app/pipeline`, `/app/cases/:caseId`, `/app/intake`, `/app/vault`, `/app/approvals`, `/app/delivery`, `/app/audit`

Vercel servirá la SPA y reescribirá las rutas internas a la entrada de `/app` sin alterar la URL del navegador.

### 6.2 Kinde

Se reutilizará la aplicación Kinde “Fr8Partners Portal”, de tipo Front-end and mobile, con el dominio de autenticación `https://auth.heymarksman.com`.

Configuración requerida:

- Agregar Allowed callback URL: `https://osp.heymarksman.com/app`
- Agregar Allowed logout redirect URL: `https://osp.heymarksman.com/app`
- Conservar callback local: `http://localhost:8791/app`
- Conservar logout local: `http://localhost:8791/app`

Las URLs se registrarán de forma exacta, sin wildcard de producción. Las callbacks existentes de `partners.heymarksman.com`, el Application homepage URL y el Application login URI no se modificarán como parte de este proyecto. La SPA calcula su redirect URI desde el origen activo, por lo que en producción utilizará el callback OSP agregado.

La posibilidad de registrarse en Kinde no concede acceso a OSP. El backend exige permisos OSP y falla de forma cerrada para cualquier identidad sin asignación.

### 6.3 Permisos

Permisos canónicos:

- `osp.case.read`
- `osp.case.review`
- `osp.package.prepare`
- `osp.package.sign`
- `osp.reply.authorize`
- `osp.reply.send`
- `osp.audit.read`

`osp.package.sign` se asignará únicamente al subject de Kinde cuyo correo verificado sea `jgonzalez@xbfreight.com`. `osp.reply.authorize` se asignará únicamente al subject cuyo correo verificado sea `sales@heymarksman.com`. `osp.reply.send` pertenecerá al worker del buzón `carriers@xbfreight.com`, no a una acción genérica del navegador.

## 7. Arquitectura funcional

### 7.1 Módulos del frontend

Cada módulo es una feature aislada con rutas, componentes, queries, mutaciones y pruebas propias.

| Feature | Responsabilidad |
|---|---|
| App Shell | Navegación, sesión, permisos, notificaciones y contexto del caso |
| Pipeline | Tablero CRM y lista de casos por estado |
| Intake | Capturas pendientes, coincidencias ambiguas y salud de Gmail |
| Case Workspace | Resumen y navegación del expediente seleccionado |
| Request | Correo original, participantes, cuerpo y adjuntos recibidos |
| Documents | Estado de análisis, cuarentena, clasificación y revisión documental |
| Requested Data | Preguntas detectadas, mapeo, valor propuesto, evidencia y decisión humana |
| Entity Vault | Vista redactada de hechos y documentos reutilizables de XBF |
| Package | Revisión, ensamble, hashes, readiness y artefactos finales |
| Signature | Reautenticación, consentimiento, aplicación de firma y revocación |
| Authorization | Aprobación de Sales sobre el payload de respuesta exacto |
| Delivery | Envío Gmail idempotente, recibos, errores y seguimiento |
| Audit | Línea de tiempo inmutable de eventos y actores |

### 7.2 Backend

El navegador sólo llama Edge Functions autenticadas. No lee ni escribe tablas o buckets directamente.

Las Edge Functions:

1. Verifican el JWT de Kinde.
2. Resuelven el workspace y `organization_uuid` mediante `workspace_registry`.
3. Validan el permiso de la acción.
4. Ignoran cualquier tenant enviado por el navegador.
5. Ejecutan la lectura o comando con scope del tenant.
6. Devuelven read models redactados.
7. Registran `request_id`, actor, recurso, resultado y tiempo.

## 8. Pipeline CRM

Estados canónicos:

1. `captured` — correo y adjuntos preservados.
2. `analyzing` — clasificación, matching y extracción en curso.
3. `needs_information` — existe un bloqueo explícito de datos, documentos o formato.
4. `internal_review` — operador revisa evidencia y decisiones.
5. `awaiting_signature` — paquete exacto listo para JAGP.
6. `awaiting_reply_authorization` — paquete firmado y borrador listo para Sales.
7. `ready_to_send` — respuesta autorizada y pendiente del worker de Carriers.
8. `sent` — Gmail aceptó el envío y existe un Message ID de salida.
9. `awaiting_provider_confirmation` — seguimiento abierto.
10. `completed` — proveedor confirmó el alta o el operador cerró con evidencia.
11. `blocked` — caso detenido por una condición que no puede resolverse en la etapa actual.
12. `cancelled` — solicitud cancelada con motivo y actor.

Toda transición conserva estado anterior, estado nuevo, motivo, actor y versión del caso. Una transición basada en una versión obsoleta se rechaza con conflicto y no sobrescribe trabajo ajeno.

## 9. Flujo de datos

### 9.1 Captura por CC

1. Una persona de XBF envía o responde al proveedor incluyendo `carriers@xbfreight.com` en CC.
2. Gmail push notifica a `provider-gmail-push`.
3. El intake obtiene el mensaje y su hilo mediante Gmail API.
4. Se persiste un envelope inmutable con Gmail Message ID, Thread ID, remitente, destinatarios, CC, fecha, asunto y cuerpo.
5. Los adjuntos se descargan una sola vez, se hashean y se almacenan en privado.
6. La combinación mailbox + Gmail Message ID es idempotente.
7. El clasificador distingue `customer_setup` del flujo inverso en el que alguien quiere convertirse en proveedor de XBF.
8. El matching utiliza remitente, dominio y `vendors`. Una coincidencia insuficiente o múltiple crea una tarea humana.
9. Se abre o reconcilia el caso OSP bajo la relación correcta.

### 9.2 Procesamiento documental

1. Se valida extensión, MIME real, tamaño y hash.
2. El archivo pasa por canary/escáner antes de ser procesado.
3. Un archivo inseguro se mueve a cuarentena y nunca se abre en el navegador.
4. PDF, XLSX y DOCX se analizan con los adaptadores entregados.
5. XLS y DOC se preservan byte a byte y generan una tarea de conversión humana.
6. Los campos detectados se mapean a la ontología canónica con confianza y evidencia.
7. Ambigüedades, campos vacíos y categorías `NEVER_INFERRED` permanecen pendientes.
8. Ninguna extracción cambia directamente el Entity Vault.

### 9.3 Revisión y ensamble

1. El operador acepta, corrige o rechaza cada propuesta.
2. Las correcciones guardan evidencia y versión esperada.
3. El operador determina qué documentos corporativos son necesarios y permitidos.
4. Readiness rechaza documentos expirados, no verificados, `never_release` o sin aprobación requerida.
5. OSP ensambla una revisión del paquete y registra hashes de plantilla, respuestas, adjuntos y salida.
6. Una plantilla cuyo hash cambió se rechaza antes de producir una salida.

### 9.4 Aprobación y firma

1. Sólo un paquete en `awaiting_signature` puede firmarse.
2. `jgonzalez@xbfreight.com` inicia una reautenticación y recibe un nonce de firma de corta duración ligado al package ID, revisión y hash.
3. La pantalla muestra el paquete exacto, la lista de datos restringidos incluidos y los documentos que recibirán firma.
4. El firmante confirma “Aprobar y firmar”.
5. El backend vuelve a validar subject, correo verificado, permiso, nonce, revisión y hashes.
6. El activo de firma se descarga desde el bucket privado y se verifica contra su hash registrado.
7. La firma sólo se aplica donde existe una colocación aprobada:
   - PDF: página, `x`, `y`, ancho y alto.
   - XLSX: hoja, celda ancla, ancho y alto.
   - DOCX: placeholder de imagen `{signature_jagp}` registrado para esa plantilla.
8. Un formato sin colocación aprobada se bloquea y genera revisión humana.
9. La salida firmada recibe un nuevo hash y se vuelve inmutable.
10. Se registra actor, hora, IP resumida, user agent resumido, nonce consumido, revisión, hash de entrada y hash de salida.

Cambiar cualquier formulario, dato, documento, destinatario material o activo de firma revoca la aprobación y obliga a crear una nueva revisión.

### 9.5 Autorización y envío

1. OSP prepara un borrador dentro del Gmail Thread ID original.
2. El payload de autorización contiene To, CC, asunto, cuerpo, package revision y hashes de adjuntos.
3. `sales@heymarksman.com` autoriza ese payload exacto.
4. Cualquier cambio posterior invalida la autorización.
5. El worker de `carriers@xbfreight.com` envía el mensaje mediante Gmail API.
6. La idempotency key combina el caso, revisión firmada y autorización.
7. Un reintento nunca produce un segundo envío si ya existe un Gmail Message ID confirmado.
8. OSP registra el recibo de Gmail y mueve el caso a `sent`.

## 10. Datos y propiedad

OSP es dueño de:

- Relaciones y casos de Provider Service.
- Mensajes y adjuntos capturados.
- Evidencia, revisiones y decisiones de campos.
- Entity Vault de XBF.
- Requisitos, readiness y waivers.
- Plantillas, paquetes, revisiones y artefactos firmados.
- Consentimientos y usos de firma.
- Borradores, autorizaciones, envíos y recibos.
- Auditoría OSP.

Rateware sólo aporta el seam documentado:

- `public.vendors`, lectura de `id`, `organization_id`, `vendor_name`, `legal_name`, `domain`, `primary_email`, `secondary_emails`, `status`.
- `public.workspace_registry` para resolver el workspace Kinde.
- `public.organizations` como objetivo de claves foráneas.

Se preservarán las constraints:

- `workspace_registry_external_canonical_unique` sobre `(organization_id, organization_uuid)`.
- `vendors_id_organization_id_unique` sobre `(id, organization_id)`.

OSP no llamará Edge Actions de Rateware.

## 11. Seguridad y privacidad

- Todo bucket OSP es privado.
- La firma original nunca se incluye en Git, frontend, logs, respuestas JSON o URLs públicas.
- Documentos y valores restringidos se muestran mediante read models redactados.
- Signed URLs, si se necesitan para una previsualización autorizada, serán de corta duración y limitadas al artefacto derivado; nunca expondrán la firma fuente.
- Los secretos de Gmail, Kinde, cifrado y Supabase permanecen en secrets server-side.
- Los logs no incluyen cuerpos de correo, tax IDs, datos bancarios, documentos, firma o tokens.
- Las acciones consecuenciales requieren permiso, versión esperada e idempotency key.
- La app falla de forma cerrada cuando no puede resolver tenant, actor, permiso, revisión o integridad.
- Los accesos cruzados entre tenants se rechazan y auditan.
- La aprobación, firma, autorización y envío son eventos distintos y no intercambiables.

## 12. Manejo de errores

| Condición | Comportamiento requerido |
|---|---|
| Gmail no conectado | Mostrar `disconnected` o `unknown`; no reportar salud falsa |
| Mensaje duplicado | Devolver el caso existente sin volver a almacenar o procesar |
| Proveedor ambiguo | Crear tarea de matching; no asociar automáticamente |
| Archivo malicioso | Cuarentena, bloqueo y evento de seguridad |
| MIME/extensión incompatibles | Rechazar procesamiento, preservar evidencia y explicar causa |
| Extracción fallida | Conservar original y crear tarea humana |
| Campo faltante o ambiguo | Mantener pendiente con causa y candidatos |
| Documento expirado o no liberable | Bloquear readiness |
| Revisión obsoleta | Responder conflicto y recargar versión vigente |
| Hash de plantilla o firma diferente | Rechazar firma y no almacenar salida parcial |
| Paquete cambiado después de firmar | Revocar firma y autorización; volver a revisión |
| Sales autoriza revisión vieja | Rechazar sin cambiar el caso |
| Gmail falla antes de confirmar | Reintentar con la misma idempotency key |
| Gmail confirma y la respuesta local falla | Reconciliar por Message ID; no reenviar |
| Permiso o tenant inválido | Denegar y auditar |

Los errores visibles al usuario incluirán acción recomendada, correlation ID y estado del caso, sin exponer detalles sensibles.

## 13. Experiencia de usuario

### 13.1 App Shell

Una sola aplicación, sin iframes, con navegación persistente y contexto del caso.

Navegación principal:

- Pipeline
- Capturas
- Documentos
- Entity Vault
- Firma JAGP
- Autorización
- Respuestas
- Auditoría
- Configuración

### 13.2 Pipeline

El pipeline ofrece Kanban y lista, búsqueda por proveedor/caso/correo, contadores honestos y filtros por propietario, bloqueo y fecha.

Cada tarjeta muestra:

- Case ID.
- Proveedor.
- Resumen de la solicitud.
- Etapa.
- Antigüedad.
- Cantidad de adjuntos.
- Progreso de campos.
- Bloqueo o siguiente compuerta.

Seleccionar una tarjeta abre un panel de contexto y permite entrar al expediente.

### 13.3 Expediente

Secciones:

- Resumen.
- Solicitud.
- Documentos.
- Datos y campos.
- Paquete.
- Actividad.

La vista Solicitud reúne el correo preservado, adjuntos, campos solicitados, evidencia, estado de readiness y las tres compuertas de JAGP, Sales y Carriers.

### 13.4 Acciones sensibles

Los botones de aprobar/firmar, autorizar y enviar aparecen sólo en la superficie correspondiente, muestran el actor requerido y explican por qué están bloqueados. El servidor vuelve a validar todo; el estado visual nunca sustituye la autorización.

## 14. Estrategia de migración

### Fase 1 — Base e integración

- Crear base limpia con OSP `c4bea07` y migraciones vigentes de main.
- Ejecutar los 660 tests y el contrato de acciones sin modificar comportamiento.
- Configurar el nuevo frontend bajo `/app` y callbacks Kinde locales.
- Introducir cliente API tipado y shell React.

### Fase 2 — Pipeline y expediente

- Migrar Pipeline, Intake, Case Workspace, Documents y Entity Vault.
- Mantener páginas heredadas como fallback durante paridad.
- Añadir pruebas Playwright y retirar iframes para estas superficies.

### Fase 3 — Paquete, firma y autorización

- Migrar revisión, readiness, paquete y approval center.
- Provisionar el activo de firma privado fuera de Git.
- Implementar nonce, colocación, firma, revocación y auditoría.
- Implementar autorización exacta de Sales.

### Fase 4 — Delivery y cierre

- Migrar delivery workspace y respuesta Gmail en hilo.
- Añadir idempotencia y reconciliación de Message ID.
- Añadir seguimiento y cierre del caso.
- Retirar las superficies HTML OSP sustituidas.

Cada fase debe producir software desplegable y verificable sin habilitar una acción consecuencial antes de que su control esté completo.

## 15. Estrategia de pruebas

### 15.1 Línea base

- Los 660 tests entregados deben pasar antes y después de cada fase.
- El contrato de acciones debe reportar cero errores.
- Toda migración debe reproducirse desde cero en Supabase local.

### 15.2 Pruebas nuevas

- Unitarias de componentes, hooks y dominios frontend.
- Contrato del cliente API TypeScript contra respuestas Edge.
- Integración HTTP real de `provider-onboarding-api` y Gmail intake.
- Storage policies para anon, authenticated, service role y roles OSP.
- Aislamiento real con dos tenants y recursos homónimos.
- Autorización negativa para operador, JAGP, Sales y sender worker.
- Red/green de hash de plantilla, activo de firma y paquete firmado.
- Revocación de firma y autorización al mutar una revisión.
- Idempotencia de captura Gmail y respuesta Gmail.
- Reconciliación cuando Gmail confirmó pero la persistencia local falló.
- Flujo sintético completo de 16 etapas desde CC hasta respuesta y seguimiento.
- Playwright de Pipeline, Expediente, firma, autorización y entrega en escritorio y móvil.
- Accesibilidad de navegación, foco, labels y mensajes de error.

Ninguna prueba puede aprobar, firmar, autorizar o enviar automáticamente contra producción. Las pruebas de acciones consecuenciales usan Supabase local o un entorno aislado con datos sintéticos.

## 16. Criterios de aceptación

El rebuild está completo cuando:

1. OSP opera desde `https://osp.heymarksman.com/app` con login Kinde válido.
2. Una copia a `carriers@xbfreight.com` crea exactamente un caso y preserva el hilo y adjuntos.
3. El caso aparece en el Pipeline y abre un expediente único sin iframes.
4. PDF, XLSX y DOCX admitidos se procesan sin alterar fuentes ni inventar valores.
5. Los datos sensibles permanecen redactados hasta una acción autorizada.
6. El operador puede resolver campos y producir una revisión exacta del paquete.
7. Sólo `jgonzalez@xbfreight.com` puede aprobar y aplicar la firma privada.
8. Cambiar el paquete después de firmar revoca la firma.
9. Sólo `sales@heymarksman.com` puede autorizar la respuesta exacta.
10. Sólo el worker de `carriers@xbfreight.com` puede enviarla.
11. La respuesta conserva el Gmail Thread ID original y no se duplica en reintentos.
12. El Pipeline conserva historial, seguimiento y cierre.
13. Las constraints del seam con Rateware permanecen presentes.
14. Los 660 tests de línea base y las suites nuevas pasan.
15. No quedan hallazgos abiertos P0, P1 o P2 en revisión de seguridad y flujo.

## 17. Referencias

- Entrega `OSP-entrega-20260820.zip`.
- `1-LEER-PRIMERO.md`.
- `2-referencia-seam-completa.md`.
- `3-migraciones-y-una-correccion.md`.
- `docs/provider-service/provider-onboarding-current-state.md` en la rama OSP.
- `docs/provider-service/provider-onboarding-form-engine.md` en la rama OSP.
- `docs/provider-service/provider-onboarding-security.md` en la rama OSP.
- `docs/provider-service/provider-onboarding-test-matrix.md` en la rama OSP.
- Kinde, “Set callback and redirect URLs”: <https://docs.kinde.com/get-started/connect/callback-urls/>.
