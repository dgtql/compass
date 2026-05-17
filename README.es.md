<div align="center">
  <h1>Compass: Tu equipo de analistas con IA</h1>
  <p><strong>Investigación de nivel analista a la velocidad y el coste de la IA.</strong></p>
</div>

<p align="center">
<a href="#licencia">
<img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue?style=for-the-badge" alt="License: PolyForm Noncommercial 1.0.0" />
</a>
<a href="https://www.python.org/downloads/">
<img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" />
</a>
<a href="https://claude.com/claude-code">
<img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-7C3AED?style=for-the-badge" alt="Powered by Claude Code" />
</a>
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">中文</a> | <a href="./README.ar.md">العربية</a> | <strong>Español</strong>
</p>

## Índice

- [Visión general](#visión-general)
- [Destacados](#destacados)
- [Tour del producto](#tour-del-producto)
- [Qué produce una investigación](#qué-produce-una-investigación)
- [Inicio rápido](#inicio-rápido)
- [Un día típico](#un-día-típico)
- [Packs de personas](#packs-de-personas)
- [Licencia](#licencia)
- [Soporte y feedback](#soporte-y-feedback)

## Visión general

Compass es un workbench de investigación para gestores de cartera. Tú **contratas analistas** — genéricos o packs de personas como Warren Buffett, Charlie Munger y Ray Dalio —, les asignas tickers y les pides que escriban lo que haría un analista del buy-side: pitch memos, reacciones a resultados, actualizaciones de mantenimiento y exploraciones libres de temas. Cada afirmación cita una fuente primaria que puedes abrir.

El workbench es la superficie: una UI en el navegador donde los chats, los árboles de cobertura, los memos y un grafo de conocimiento en vivo conviven uno al lado del otro. Todo lo que produce un analista es un archivo de texto en disco: lo abres en tu editor, lo buscas con grep, lo versionas, lo compartes. No hay base de datos oculta.

<p align="center">
  <img src="assets/interface_main.PNG" alt="Interfaz principal de Compass" width="1000">
</p>

## Destacados

- **🎓 Incorpora a cualquiera como analista** — Contrata desde packs de personas incluidos (Buffett, Munger, Dalio) o incorpora una nueva mente apuntándonos a los escritos, entrevistas o un libro de una figura pública. Cada persona incorporada se convierte en un analista contratable con su propia voz y mirada.
- **⚗️ Pipeline de destilación** — Mete una página de Wikipedia, un montón de cartas a accionistas o un libro; sale una skill de analista estructurada — voz, modelos mentales, workflow por defecto — lista para que la pulas antes de ponerla en la mesa.
- **👥 Dirige un pod, no un solo agente** — Tú eres el PM. Contrata analistas de equity, gestores de riesgo, científicos de datos, ingenieros de datos, especialistas sectoriales y más. Cada asiento mantiene su propia lista de cobertura, workflow por defecto y voz de escritura.
- **🧠 Grafo de conocimiento como tu segundo cerebro** — Memos, tickers, temas, analistas y citas renderizados en un único tablero conectado. Mira lo que ha escrito tu pod, a dónde rastrean las afirmaciones, y dónde están los huecos.
- **💡 Investigación de ideas a través de todas las fuentes** — Sintetiza memos pasados de cada asiento del desk, papers académicos (arXiv, SSRN, Semantic Scholar), reportes sell-side, contenido online y la web. El master agent saca a la luz ideas que el pod ya tiene y caza ideas nuevas.
- **🛠️ Control de workflow por entregable** — Compón la cadena de skills detrás de cada output: pitch memos, briefings matutinos, reacciones a resultados, actualizaciones de mantenimiento, exploraciones de tema. Mete skills nuevas, reordena pasos o construye tipos de memo enteramente nuevos.

## Tour del producto

<details>
<summary><strong>🎓 Talent Pool</strong> — Personas destiladas y analistas incorporados, listos para contratar.</summary>

<p align="center">
  <img src="assets/talent_pool.PNG" alt="Talent pool" width="1000">
</p>

</details>

<details open>
<summary><strong>🧠 Segundo cerebro</strong> — Grafo de conocimiento de cada memo, ticker, tema, analista y cita que ha producido tu pod.</summary>

<p align="center">
  <img src="assets/second_brain.PNG" alt="Grafo de conocimiento como segundo cerebro" width="1000">
</p>

</details>

<details>
<summary><strong>🧰 Biblioteca de skills</strong> — Skills atómicas que tus analistas encadenan en workflows — añade nuevas sin código.</summary>

<p align="center">
  <img src="assets/skills_lib.PNG" alt="Biblioteca de skills" width="1000">
</p>

</details>

<details>
<summary><strong>🧭 Biblioteca de workflows</strong> — Workflows con plantilla detrás de cada entregable: pitch memo, reacción a resultados, briefing matutino — totalmente componibles.</summary>

<p align="center">
  <img src="assets/workflow_lib.PNG" alt="Biblioteca de workflows" width="1000">
</p>

</details>

<details>
<summary><strong>🗄️ Biblioteca de datos</strong> — Fuentes de datos enchufables disponibles para cada asiento del desk.</summary>

<p align="center">
  <img src="assets/data_lib.PNG" alt="Biblioteca de datos" width="1000">
</p>

</details>

## Qué produce una investigación

Cuando un analista trabaja un ticker, todo aterriza bajo `data/engagements/<analyst>/<TICKER>/`:

| | Artefacto | Ubicación | Descripción |
|---|---|---|---|
| 📄 | Memos | `memos/` | Pitch memos, reacciones a resultados, updates de mantenimiento, write-ups de ideas |
| 📚 | Filings | `corpus/filings/<FORM>/<ACCESSION>/` | 10-K, 10-Q, 8-K — descargados como Markdown limpio vía `edgartools` |
| 📈 | Snapshots de mercado | `corpus/snapshots/yahoo/` | Precio diario, rango de 52 semanas, consenso de analistas, financieros |
| 📰 | Noticias y prensa | `corpus/news/`, `corpus/press/` | Noticias recientes y notas de prensa |
| 🎤 | Transcripciones | `corpus/transcripts/` | Transcripciones de earnings calls cuando están disponibles |
| 🔬 | Investigación | `corpus/research/` | Búsqueda web y notas de survey de literatura académica |
| 📐 | Análisis | `analysis/kpis/`, `analysis/sections/` | KPIs extraídos y secciones de memo en borrador |
| 🧾 | Brief de cobertura | `.pipeline/docs/coverage_brief.json` | One-pager vivo del analista sobre ese nombre |

Las investigaciones temáticas (ideas de trading abiertas vía el master chat) aterrizan bajo un sintético `house/IDEA-<slug>/` para no contaminar los árboles de cobertura reales.

## Inicio rápido

### Requisitos previos

- **Python 3.10+**
- Una suscripción a **[Claude Code](https://claude.com/claude-code)** — Compass se autentica a través del OAuth de Claude Code, así que no hay API key separada que gestionar.
- **Node.js** *no* es necesario — la UI web está pre-compilada y va con el paquete.

### Instalación

```bash
git clone https://github.com/<your-username>/compass
cd compass
pip install -e .
```

### Inicia sesión en Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude /login
```

Sigue el prompt de OAuth. Compass recoge las credenciales automáticamente.

### Identifícate ante SEC EDGAR

La SEC requiere un nombre y un email en el User-Agent para las requests de filings. Copia `.env.example` a `.env` y configura:

```env
COMPASS_SEC_USER_NAME=Tu Nombre
COMPASS_SEC_USER_EMAIL=tu@example.com
```

### Arranca el workbench

```bash
compass serve
```

Abre [http://127.0.0.1:8001](http://127.0.0.1:8001) en tu navegador. Desde ahí puedes contratar analistas, montar una watchlist y lanzar investigaciones sin volver a tocar la terminal.

<details>
<summary><strong>¿Prefieres la CLI?</strong></summary>

Algunos comandos útiles si prefieres conducir todo desde la terminal:

```bash
compass templates                  # lista los workflows de memo disponibles
compass plan NVDA pitch-memo       # planifica una investigación (genera tasks.json)
compass run NVDA pitch-memo        # planifica + ejecuta end-to-end
compass status NVDA                # muestra el brief y el estado por tarea
compass engagements                # lista las investigaciones materializadas
compass universe --sector Technology   # navega el catálogo de tickers de EE. UU.
```

</details>

## Un día típico

1. **Elige nombres.** Abre *My Universe*, busca en el catálogo de tickers de EE. UU. y añade los nombres que te interesan a tu watchlist.
2. **Contrata tu equipo.** Mete un pack de persona (Buffett, Munger, Dalio) o destila uno nuevo desde una página de Wikipedia. Cada analista se sienta a su mesa, con su voz y su workflow por defecto.
3. **Abre un chat.** Pide a Maria Chen (o a Warren) "escribe un pitch memo de NVDA". El panel derecho te muestra el trabajo en vivo: filings que se descargan, noticias que se leen, secciones que se redactan.
4. **Lee el memo.** Cada afirmación es una cita clickeable que vuelve al filing original, la transcripción o la noticia. ¿No te convence una tesis? Responde en el chat y el analista la reescribe.
5. **Trabajo temático en el master chat.** Cuando quieras pensar a nivel del book — "¿dónde estamos expuestos si la Fed se queda quieta hasta el Q3?" — el master chat corre un survey y te entrega un memo de dos secciones: cuáles de tus ideas actuales están expuestas al tema, más nuevas ideas a considerar.

## Packs de personas

Compass viene con tres packs de personas de inversores listos para contratar:

| | Persona | Estilo | Lente integrado |
|---|---|---|---|
| 🟦 | **Warren Buffett** | Mentalidad de propietario, moat primero, largo plazo | Moats económicos, owner earnings, calidad del management |
| 🟧 | **Charlie Munger** | Latticework de modelos mentales, inversión | Checklist multidisciplinario, "¿qué haría que esto fuera una idea terrible?" |
| 🟪 | **Ray Dalio** | Macro, basado en principios, consciente del régimen | Ciclos grandes, dinámica de deuda, cambios de régimen |

También puedes destilar una nueva persona desde la página de Wikipedia de una figura pública — Compass usa la skill de Buffett incluida como plantilla y le pide a Claude que escriba el resto. Trátalo como punto de partida y luego refina a mano.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE). Libre para usar, modificar y compartir para **proyectos personales, investigación, educación y otros propósitos no comerciales**. **El uso comercial no está permitido** sin una licencia separada — escríbenos si quieres hablar de una.

## Soporte y feedback

Compass está en desarrollo activo. El workflow core — contratar, watchlist, pitch memo, reacción a resultados, exploración temática — funciona end-to-end. Espera rugosidades, especialmente en nombres no-US y fuentes de datos esotéricas.

- 🐛 **¿Encontraste un bug?** Abre un issue en GitHub.
- 💡 **¿Tienes una idea o un workflow que te gustaría ver?** Abre una discussion — el feedback marca la roadmap.
- 📬 **¿Consultas de licencia comercial o partnerships?** Contacta a través de la información del repo.
