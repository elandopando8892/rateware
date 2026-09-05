# Enlace de memoria: primer corte, comparación en lectura

Fecha: 2026-09-05. El usuario aprobó implementar ADR-OSP-001 en local/preview.
Esta entrega cubre su primer corte visible; no se declara terminado el enlace
persistente ni la renovación auditable.

## Entregado

- Comparación desde una respuesta aceptada y vigente del formulario existente.
  Muestra respuesta, evidencia aprobada, dato actual, revisión/vigencia y el
  número de campos que abarca la publicación documental completa.
- Cinco resultados: dato ya reutilizable, renovación requerida, publicación
  documental pendiente, conflicto con el hecho actual o bloqueo del origen.
- Sin controles de escritura en la comparación. Consultar no acepta, enlaza,
  renueva, publica, firma, adjunta ni envía.
- Acción autenticada `get_answer_memory_evidence` en `osp-form-api`. La
  organización proviene de la identidad verificada, nunca del cuerpo.
- Migración **local**, `20260905083000_osp_answer_memory_evidence_preflight.sql`:
  una función SQL estable de lectura con search_path vacío. EXECUTE sólo para
  `osp_workflow_api`, sin nuevos SELECT sobre tablas corporativas ni autoridad
  de escritura. Anon/authenticated/service_role/worker no reciben ejecución.
- La consulta exige respuesta aceptada, versión/plantilla/valor actuales,
  binding/entidad vigentes y evidencia coincidente exacta de la misma organización
  y entidad. No compara texto enmascarado ni publica el resto del documento.
- La renovación se identifica sólo cuando la evidencia base venció pero
  permanece activa/verificada y el nuevo respaldo exacto ya fue revisado y
  publicado. Un origen retirado/rechazado no se presenta como renovable.

## Verificación

Las habilidades de pruebas y checklist priorizaron los límites de identidad,
vigencia, lectura sin efectos y verificación visual antes de preview:

- 11 pruebas Deno aprobadas, con 5 pasos SQL (incluyen múltiples variantes de
  fuente obsoleta, entidad, revisión y sensibilidad); el preflight se ejecutó
  con el rol real `osp_workflow_api` sobre las migraciones y una fixture reducida.
- 41 pruebas Vitest aprobadas: comparación, errores/reconsulta, ausencia de
  controles de escritura, ocultación de candidatas inválidas, revisión previa
  y contrato de cliente. Pool forks, un worker, sin aumentar timeouts.
- 39 controles de frontera UI aprobados. Se inventariaron tres nuevos archivos
  de producción; no se flexibilizó la política para fuentes no revisadas.
- Contrato de acciones 162/162: una acción HTTP de lectura y su RPC. El primer
  generador estaba aún usando el conteo anterior al terminar de añadir la RPC;
  rechazó 161/162. Se registró explícitamente la superficie nueva y se regeneró.
- TypeScript, lint enfocado de UI/consulta, build sintético y diff-check aprobados.

La primera ejecución SQL tardó 4m41s frente a segundos en turnos anteriores;
la siguiente, con RPC/rol limitado, terminó en 49s. La lentitud también afectó
lecturas iniciales y herramientas. No se terminaron procesos del usuario ni se
confundieron demoras del host con fallos funcionales. La primera comprobación
visual no pudo conectarse a localhost; se inició el servidor propio del build.
La ejecución y su reintento se documentan, no se presentan como un primer PASS.

Smoke local posterior aprobado e inspeccionado en 1280×900 y 390×844: dos
comparaciones de evidencia, cero controles de escritura en la comparación,
cero escrituras/solicitudes externas permitidas, dos intentos de fuentes
bloqueados, cero errores de página y cero desbordamiento. Las decisiones
sintéticas se reinician al recargar. Se conserva el estilo XBF existente,
sin cambiar logos ni tipografías. Evidencia privada en
`tmp/osp-s13-evidence-preflight-evidence`; no se sobrescribió la evidencia previa.

No se certifican concurrencia PostgreSQL remota, rendimiento productivo ni
aceptación de un paquete real del carrier mediante estas pruebas embebidas.

## Preview y límite de activación

Build estático con `VITE_OSP_BUILD_PROFILE=preview-synthetic`, datos ficticios y
cliente de autenticación sintético. La opción de build no modifica la autenticación
Supabase de producción. Se reutiliza el proyecto Vercel existente; sin funciones,
secretos, infraestructura nueva, push ni promoción productiva.

La futura activación de API requiere comprobar/aplicar, con autorización específica,
las migraciones locales previas de memoria aprobada, captura, revisión y esta
función de lectura; no asumir que estar en Git implica estar en Supabase.
Una API antigua no ofrecerá la comparación nueva; la UI muestra un error de
lectura recuperable, sin reintentar escrituras ni afirmar reutilización.

Rollback de este corte: retirar la UI/API nueva, conservar datos y recibos existentes.
La función de lectura no necesita borrar datos. Bloquear despliegue si hay
escrituras, acceso externo inesperado, error visual o desbordamiento móvil.

## Pendiente dentro del diseño ya aprobado

1. Recibo persistente del enlace con revalidación atómica, identidad e idempotencia.
2. Renovación de respaldo documental sin borrar fuentes/recibos originales.
3. Comparación completa de cambios para la publicación documental, no sólo conteo.
4. Pruebas de concurrencia, integración del lector de memoria y canary sin salientes.

No hace falta solicitar otra aprobación del desarrollo local de estos puntos.
Producción, migraciones remotas, publicaciones reales y envíos siguen fuera.
