# OSP v1: cierre por resultado, no por cantidad de sprints

Fecha: 2026-09-08. Base local comprobada: `586a253`.
Estado: plan de cierre; no constituye evidencia de despliegue ni habilita salientes.

## Objetivo único

Un carrier solicita el alta de XBF. Desde OSP, una persona autenticada puede
revisar todo lo solicitado, completar los originales, reunir soportes vigentes,
resolver faltantes y preparar el paquete exacto para Sales. Ningún requisito
desaparece y ningún archivo incompleto sale como completo. La entrega requiere
la aprobación humana aplicable y queda vinculada al paquete aprobado.

Salzillo es la prueba de fidelidad, junto con dos casos reales PDF/DOCX. Trabajar
en una revisión/canary aislado: no alterar ni reenviar el Salzillo histórico.
Una excepción debe estar justificada y autorizada; no sirve para convertir un
requisito obligatorio del carrier en opcional sin su aceptación cuando corresponda.

## Situación verificada y límites

El código local contiene generación multiformato, conjuntos de archivos,
descargas, evaluación de requisitos y persistencia de inspecciones. Las últimas
pruebas incluyen PostgreSQL reducido; no prueban el esquema productivo completo.
La captura por archivo ya está conectada a HTTP/UI en el candidato local, junto
con la finalización de Operaciones sobre el conjunto exacto; falta certificar
ese recorrido en una preview autenticada compatible. Los consumidores de
firma/Sales/envío para conjuntos aún no están cerrados. PDF/DOCX pueden producir
anexos: eso no demuestra que el formulario original esté completamente llenado.

La consulta de producción del 8 de septiembre confirmó que las tablas nuevas
de conjuntos e inspecciones aún no existen y que la UI sigue en `ed12d16`
(`dpl_Ggf4PYD79X66rfFLipw3kNuj5Fhe`). El candidato local no está desplegado.
El informe inicial de cierre contiene un snapshot antiguo, incluso un bloqueo
de remoto privado posteriormente resuelto; no usarlo como estado actual. El 70% comunicado
no tenía un denominador validado y se retira como indicador de cierre.

## Alcance congelado

P0: resolver el recorrido completo existente y probarlo. Reutilizar UI, memoria
supervisada, roles y Supabase compartido. No reconstruir el producto.
PDF/DOCX no soportado automáticamente: mostrar el impedimento y permitir una
corrección humana vinculada al original, sujeta a las mismas verificaciones.
No declarar el modo human-approved como automatización universal.

Fuera de este cierre: nuevos formatos, entrenamiento/fine-tuning, módulos nuevos,
rediseño visual, nueva infraestructura, procesamiento universal sin intervención.
La imagen de firma de desarrollo no acredita una firma autógrafa exigida.

## Un sprint de cierre propuesto: diez días hábiles

Es un timebox de planificación, no una promesa de duración ni ejecución autónoma
en segundo plano. Capacidad asumida: un agente implementador, usuario disponible
para documentos/decisiones puntuales; siete días de trabajo previsto y tres de
reserva para fallos, integración y revisión. Reestimar tras la primera demostración.

| Hito secuencial | Trabajo previsto | Salida visible obligatoria | Modelo/esfuerzo recomendado |
| --- | --- | --- | --- |
| 1. Recorrido de revisión | 2 días | Guardar inspecciones por archivo desde UI autenticada, recargar y recuperarlas; completar Operaciones sobre el conjunto exacto; cambios de archivo invalidan la revisión | Astra alto para contrato/seguridad; Sol alto para implementación |
| 2. Paquete que sí responde | 3 días | Salzillo original de dos páginas y PDF legible, todos los requerimientos y soportes conciliados; PDF/DOCX de otros dos casos completos o bloqueados explícitamente; firma aplicable y Sales consumen el mismo conjunto | Astra alto para fidelidad y fallos cruzados; Sol alto para integración |
| 3. Liberación verificada | 2 días | Ensayo sobre esquema compatible, preview autenticada, pruebas negativas y reintentos, despliegue con rollback y smoke; ruta de envío exacto lista para Sales | Sol alto para release; Astra alto sólo ante un bloqueo complejo |

Dependencias: 2 requiere el cierre de 1; 3 requiere 1 y 2. No hacer integraciones
de producción incompletas para aumentar un porcentaje. No cambiar el modelo
automáticamente: la tabla es una recomendación de asignación.

## Criterios de salida: seis puertas, no un porcentaje subjetivo

1. **Requerimientos:** correo y todos los originales aparecen en una matriz;
   cada requisito tiene cumplimiento comprobado, faltante visible o excepción válida.
2. **Fidelidad:** todos los originales requeridos completos y legibles en el
   formato solicitado, sin perder páginas/secciones; ningún anexo sustituye
   indebidamente al formato. Campos de uso interno del carrier preservados.
3. **Evidencia:** documentos correctos, vigentes y asociados al requisito;
   datos faltantes no inventados; firma acorde al método exigido.
4. **Recorrido UI:** login, corrección, inspección persistente, revisión y Sales
   funcionan sin SQL manual ni cambios de rol entre pasos para el superusuario.
5. **Paquete/entrega:** firma aplicable, congelación, Sales y preparación del
   envío verifican el mismo conjunto; reintentos no duplican la entrega. Un envío
   real y su recibo sólo se prueban bajo autorización concreta de Sales; mientras
   falte, reportar “listo para liberación, entrega final pendiente”, no 100%.
6. **Producción:** migraciones conciliadas y ensayadas, despliegue identificado,
   tres canaries reales, smoke autenticado y rollback verificado; ningún efecto
   ajeno en Rateware. Un caso incompleto debe bloquearse correctamente, pero ese
   bloqueo no cuenta como prueba positiva de un paquete completo.

Estado inicial de cierre: las seis puertas están **pendientes de certificación
extremo a extremo**. No significa que no exista desarrollo: significa que no se
contarán pruebas parciales como resultado final.

Actualización técnica del 8 de septiembre: las pruebas focalizadas de backend
pasaron (25 pruebas y ocho pasos en una ejecución; 15 y ocho pasos después de
la última ampliación). La suite UI de 29 pruebas tuvo 27 aprobadas y dos
timeouts; intentos posteriores también encontraron timeouts de arranque/carga.
Existe una prueba previa de persistencia y recarga desktop/mobile, pero no
certifica los cambios posteriores ni producción. El hito 1 sigue abierto.

## Control de avance y regla de parada

La próxima entrega debe incluir la demostración del hito 1, no sólo otro helper.
Si no se logra en el primer bloque previsto, presentar causa concreta y alcance
recortable antes de sumar más tareas. Registrar el fallo y su hipótesis; no repetir
releases de tanteo ni iniciar otro sprint sin conciliar lo anterior.

En cada entrega informar: resultado visible, evidencia/URL/commit, puerta que
cierra, bloqueo restante, modelo/esfuerzo y estado local/preview/producción.
Revisar avance a mitad del timebox. Al final: aceptar el producto con evidencia
o declarar el NO-GO y su causa específica; nunca prolongarlo silenciosamente.
