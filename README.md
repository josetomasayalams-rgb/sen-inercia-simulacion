# ¿Quién sostiene la red?

Simulación educativa 3D de frecuencia, tensión, inercia, GFL y GFM-VSM sobre una barra equivalente de 220 kV.

Está pensada para público general: permite comparar, con la misma perturbación, cuatro casos:

- Referencia sin soporte complementario.
- BESS grid-following con P/Q fijo, sin soporte configurado.
- Generador térmico síncrono.
- BESS grid-forming con VSM y soporte P/Q limitado.

La historia usa una pérdida equivalente de generación de `160 MW` a `t=2,30 s` y un evento reactivo separado de `+60 MVAr` a `t=2,35 s`. La frecuencia, el ROCOF, la tensión y la potencia se calculan desde un solver RMS/fasorial de una barra y se muestran en una cinemática Three.js. En la térmica, la energía cinética `H·S` reduce el ROCOF inicial y el gobernador/turbina suavizan progresivamente la pendiente posterior.

## Verificación

```bash
npm install
npm run dev
npm run build
npm run check
```

El modelo usa paso fijo `dt=1/240 s`, límites de potencia aparente/corriente/SOC y mantiene separado el solver físico del render. El caso GFL-PQ sigue la red mediante PLL, pero no aporta por frecuencia porque no tiene PFR, FFR ni Volt/Var configurado. Un GFL con esos servicios sí puede aportar; GFL no significa pasividad universal.

La formulación matemática, los supuestos y la correspondencia entre cada ecuación y el código están documentados en [docs/modelo-fisico.md](docs/modelo-fisico.md).

## Alcance

Es una herramienta educativa. No es un estudio EMT, no es un caso operativo homologado del SEN y no es un modelo comercial de fabricante. La figura de Dalrymple usada como referencia corresponde a una falla de línea y no se copia como una pérdida sistémica de generación.

## Estructura

```text
src/sim/       Solver RMS/fasorial independiente de Three.js y del DOM
src/render/    Escena 3D, subestación, líneas y cinematografía
src/ui/        HUD y gráficas sincronizadas
src/check/     Validaciones headless
```
