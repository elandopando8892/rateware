# OSP: reglas de memoria y contradicciones

Fecha: 2026-09-05. Alcance: definición y correcciones locales; no activación productiva.

## Resultado de negocio

XBF se da de alta como **cliente** de un proveedor de transporte. OSP debe
contestar el requerimiento completo del carrier, conservar su formato y mostrar
qué falta antes de firma, autorización o envío. No es un flujo de cotizaciones.
La memoria debe evitar pedir otra vez información válida sin convertir una
respuesta previa en verdad universal ni en permiso de divulgación.

## Reglas y estado de implementación

| Información | Regla de reutilización | Estado de este bloque |
| --- | --- | --- |
| Respuesta guardada en un formulario | Es una candidata del caso, no prueba de autoría humana ni aprobación. | Captura local existente; no entra en autollenado aprobado. |
| Respuesta aceptada por Operaciones | Conserva sujeto, motivo, hash, versión y entidad. Aceptar no publica un dato maestro. | Revisión local existente; `approvedForReuse: false`. |
| Dato corporativo documentado | Sólo misma organización y entidad XBF, revisión documental aprobada, valor exacto promovido, fuente verificada/activa y vigencia válida. | Proyección local existente sobre el catálogo de Rateware; sin crear un catálogo paralelo. |
| Respuesta aceptada que todavía no es dato corporativo | Debe enlazarse con evidencia válida y una promoción explícita. No fabricar revisiones documentales para sortear el requisito. | **Puente pendiente**, no implementado ni activado aquí. |
| Requisito, alias o concepto del carrier | Es conocimiento del requerimiento, no un dato de XBF. Su reutilización sólo propone una interpretación que debe validarse contra el nuevo original. | Regla para el puente pendiente; no modificar el catálogo supervisado en este bloque. |
| Documento reutilizable | Verificar entidad, tipo, integridad, vigencia y antigüedad exigida por el carrier actual. Un dato vigente no demuestra que su documento cumpla. | La proyección de hechos no reemplaza los controles del Request Contract. |
| Bancos, identificadores, firmas, crédito y referencias comerciales | No capturarlos mediante la lista genérica de respuestas básicas. Aplicar su revisión, alcance y divulgación específicos. | Exclusión existente en la captura; no se amplía aquí. |

El puente pendiente debe distinguir dato corporativo documentado de declaración
de contacto verificable. Si se requiere admitir esta última como fuente, su
política de evidencia, alcance y caducidad debe aprobarse antes de implementarla;
no se debe simular que existe un documento.

## Reglas ejecutables del autollenado

1. Conservar el valor humano guardado; una fuente nueva no lo sobrescribe.
2. Si una fuente elegible discrepa, marcar el campo `contradictory` y el plan
   `awaiting_clarification`, incluso cuando el campo ya tenga valor.
3. Un valor guardado no equivale a un recibo que resuelva la contradicción.
   El plan actual no recibe ese recibo: no debe inferirlo por coincidencia parcial,
   antigüedad ni por el rol del usuario.
4. Para detectar valores iguales conservar la normalización existente (tipo y
   valor, con trim de texto). No equiparar por intuición RFC/TAX-ID, cuenta/CLABE,
   domicilio fiscal/comercial ni entidades mexicana/estadounidense.
5. Igualdad de valores puede reducir alternativas, pero nunca eliminar las
   referencias de evidencia. Conservar todos los IDs únicos de fuentes elegibles.
6. Una fuente inválida o de baja confianza no sobrescribe ni crea por sí sola
   una contradicción resuelta como cierta. Su tratamiento sigue el flujo de
   revisión de extracción; este plan no convierte incertidumbre en evidencia.
7. `ready_for_operations_review` significa sólo borrador preparado para revisión.
   No significa información documental verificada, matriz completa, autorización
   de firma ni permiso para enviar.

## Reglas del cierre del paquete

El catálogo de memoria nunca puede omitir una fila del Request Contract del
carrier actual. Cada requisito debe estar satisfecho con evidencia comprobable,
pendiente explícito o descartado con justificación humana dentro de la política
vigente. No rellenar ausencias inventando correos, referencias o fechas. Una
solicitud de PDF firmado y dos páginas completas no queda satisfecha por enviar
un XLSX parcialmente llenado. Estas reglas son el criterio de aceptación del
producto, no una certificación de que Salzillo ya lo cumple.

La reutilización es recuperación de conocimiento supervisado, **no entrenamiento
de pesos del LLM**. No se inicia fine-tuning, llamada a modelos, carga externa,
divulgación ni infraestructura adicional como parte de este bloque.

## Depuración reproducida y corrección

La habilidad de depuración guió la secuencia reproducción -> causa -> regresión.

- **Contradicción oculta:** el retorno temprano de `existing_draft` omitía comparar
  fuentes. Una razón social guardada diferente de la evidencia devolvía
  `ready_for_operations_review`. Ahora conserva el valor y solicita aclaración.
- **Proveniencia incompleta:** la deduplicación por valor descartaba candidatos
  antes de obtener evidencia; además el borrador devolvía evidencia vacía. Ahora
  la evidencia se obtiene de todos los candidatos elegibles originales.
- **Debilidad del test SQL:** el esquema reducido permitía incrementos de versión
  sin cambiar valores y saltos de versión que el guard real prohíbe. El test ahora
  instala las funciones y triggers reales de protección de instancia y plantilla,
  usa ediciones consecutivas legales y verifica retroceso/revisión ficticia y
  modificación de plantilla publicada rechazados. No fue un fallo demostrado
  de producción ni requirió alterar SQL productivo.

Las tres aserciones nuevas de contradicción/proveniencia fallaron antes del fix.
La comparación con evidencia no elimina respuestas ni reabre casos avanzados:
el adaptador conserva su bloqueo existente de estados gobernados por humanos.
El cambio puede mostrar más aclaraciones en borradores realmente contradictorios;
no modifica documentos firmados ni recibos ya emitidos.

## Salida de este bloque y siguiente actividad

Validar pruebas de preparación, persistencia, memoria aprobada y captura/revisión,
incluyendo aislamiento de entidad/tenant, evidencia vencida, rechazo de aprobación
obsoleta e idempotencia. Verificar el contrato estático de acciones sin ampliar
endpoints ni permisos. Son pruebas locales y SQL embebido: no prueban concurrencia
en PostgreSQL remoto ni aceptación real del carrier.

Resultado ejecutado: **19 pruebas Deno aprobadas, con 31 pasos SQL**, usando
`--frozen --allow-read --allow-env` sobre `automatic-preparation.test.ts`,
`postgres-automatic-preparation.test.ts`, `approved-profile-memory.integration.test.ts`
y `answer-memory-capture.integration.test.ts`. Contrato de acciones **160/160**
aprobado; sólo se regeneraron las huellas afectadas de `osp-worker`. `git diff
--check` y lint del código funcional modificado aprobados. El lint sin exclusiones
de los tres archivos de prueba reportó cinco diagnósticos preexistentes: cuatro
imports versionados inline y un mock async sin await. No se desactivaron reglas
ni se presentó ese lint como aprobado. El lock incorpora la integridad de PGlite
0.5.8 ya usado por los tests anteriores, sin agregar un proveedor ni un servicio.

Siguiente actividad recomendada: diseñar el enlace candidata aceptada -> evidencia
válida -> promoción al catálogo existente, con alcance/vigencia y detección de
conflictos antes de programar su activación. Modelo Codex recomendado: **GPT-6
Astra, Xhigh** para ese límite SQL/evidencia. Este bloque de reglas/depuración:
**GPT-6 Astra, High** recomendado; no implica cambio de configuración del modelo.

No push, migración remota, despliegue, modificación del caso Salzillo, firma,
autorización Sales, correo o webhook realizados en este bloque.
