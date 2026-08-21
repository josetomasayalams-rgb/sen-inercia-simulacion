# Modelo físico de la comparación

Esta simulación es un equivalente RMS/fasorial educativo de una barra. No es un
estudio EMT, un modelo de fabricante ni un caso operativo oficial del SEN.

## Perturbación común

Los tres casos reciben la misma pérdida activa y, de forma separada, el mismo
incremento de demanda reactiva. La frecuencia del área se integra con:

\[
\frac{df}{dt}=\frac{f_0}{2(E_{phys}/S_B)}
\left(P_{flota}+P_{soporte}-P_{carga}-D_f\frac{f-f_0}{f_0}\right)
\]

`E_phys` contiene solo energía cinética física. La inercia virtual del GFM no se
suma a este término porque su efecto ya entra explícitamente como `P_gfm`.

## 1. Sin soporte

Es la referencia: `P_soporte=Q_soporte=0`. Muestra qué ocurre cuando nadie
reemplaza los MW ni los MVAr del evento.

## 2. Térmica síncrona

La máquina agrega desde antes del evento energía `H S` a `E_phys`; por eso reduce
el RoCoF físico inicial sin esperar una medición. Después actúan el gobernador,
la turbina y el AVR mediante dinámicas de primer orden, droop y límites.

## 3. GFM tipo VSM

El GFM se representa como una fuente interna `E∠δ` detrás de una reactancia:

\[
P\approx\frac{EV}{X}\sin\delta,\qquad
Q\approx\frac{E^2-EV\cos\delta}{X}
\]

Su ángulo sigue una dinámica de máquina virtual:

\[
2H_v\dot{\Delta\omega_v}=P^*-P_e-D_v\Delta\omega_v,
\qquad \dot\delta=\omega_v-\omega_{red}
\]

El controlador de tensión modifica `E` ante `V` y `Q`. La respuesta aparece tras
los filtros/control digital; no es energía mecánica instantánea. La potencia
activa sale del BESS y respeta simultáneamente SOC, energía, `Smax` e `Imax`.

## Fuentes de contraste

- NREL, *Virtual Synchronous Machine Grid-Forming (REGFM_B1)*, NREL/TP-5D00-90260, 2024: modelo GFM como fuente de tensión detrás de impedancia, bloque VSM, filtros y límites de corriente. https://www.nrel.gov/docs/fy24osti/90260.pdf

Las constantes numéricas de esta aplicación son supuestos pedagógicos declarados;
las fuentes respaldan la estructura dinámica, no un ajuste comercial específico.
