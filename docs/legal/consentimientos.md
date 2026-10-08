# Textos de consentimiento (como se muestran en la app)

Versión 2026-10-v1. Se registran en la tabla `consentimientos` (usuario, tipo, versión, origen, fecha).

## 1. Al crear la cuenta (obligatorio, casilla sin marcar de entrada)
> He leído y acepto los **Términos y Condiciones** y la **Política de Privacidad**.

Tipo `terminos_privacidad`, origen `registro`. El servidor rechaza la creación de la cuenta si no viene la versión aceptada (función `handle_new_user`).

## 2. Al guardar el CV (obligatorio para usar esa función, casilla sin marcar de entrada)
> Doy mi **consentimiento expreso** para que el texto de mi CV se trate con inteligencia artificial para analizar mi perfil y ordenar ofertas, y para que se transfiera a proveedores ubicados en el exterior (Estados Unidos y Brasil), según la **Política de Privacidad**. Puedo retirar este consentimiento eliminando mi CV o mi cuenta.

Tipo `cv_ia_transferencia`, origen `carga_cv`. Consentimiento separado del anterior para que sea específico, libre e informado (arts. 5 y 6 de la Ley 25.326); no se usa para marketing ni se condiciona a otros servicios.

## Por qué dos consentimientos y no uno
Aceptar el contrato (términos y privacidad) es distinto de consentir un tratamiento específico y de mayor riesgo (análisis con IA y transferencia al exterior de un documento personal). Pedirlos por separado y en el momento en que se necesitan los hace más claros y más fáciles de probar.
