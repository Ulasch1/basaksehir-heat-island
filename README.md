# Urban Heat Island Prioritization System

Deciding **which** neighborhood gets the tree-planting budget, **what kind** of intervention
it needs, and **when** it will need it, from open data.

Built for Başakşehir municipality (İstanbul) as an internship project, with full ISO/IEC
330xx (SPICE) process documentation.

---

## The problem

In summer, some neighborhoods in Başakşehir stay noticeably hotter than their surroundings
because of high building density and low green cover. The municipality has no systematic way
to identify these areas or to prioritize investment, so decisions are driven by incoming
requests and observation.

## The model

```
Hazard    = mean( (1 - greenCoverRatio), buildingDensity )
Exposure  = scaled population density        // 0.1 - 1
Risk      = Hazard × Exposure
```

**Why multiplication instead of a weighted sum.** Hazard measures how structurally prone an
area is to the heat island effect; exposure measures how many people that affects. With a
weighted sum, an empty plot of land would score high and the system would recommend planting
trees where nobody lives. Multiplication surfaces areas that are both structurally
unfavorable and densely populated.

**Why the exposure floor is 0.1 and not 0.** Because risk is a product, driving exposure to
zero zeroes out the neighborhood's risk entirely, so the system reports "no risk" for a place
where people actually live. The floor prevents this.

The most useful thing the model produces is this: **the most structurally unfavorable
neighborhood is not necessarily the highest priority one**, once population distribution is
taken into account.

## The AI layer

The risk score answers "how urgent is this neighborhood". Two models answer what it cannot:

| Capability | Method | Question it answers |
|---|---|---|
| **Neighborhood typology** | k-means, unsupervised clustering | **What kind** of intervention fits? Roof gardens and shade structures for dense built-up areas, planting corridors for sparse ones |
| **Risk projection** | Trend fitting over historical population series | **When** will it be needed? A tree takes years to cast usable shade, so planting should be planned against future risk, not today's |

Clustering is unsupervised because no labeled dataset of "correct" neighborhood typologies
exists. A supervised model would only learn the assumptions we fed it.

**Known limitation:** clustering runs on 10 observations. That is too small a sample to
determine the number of clusters from the data itself, so the cluster count is fixed in
configuration and a silhouette score is reported on every run. If separation turns out to be
weak, that is reported as a finding rather than hidden.

## Architecture

```
PRESENTATION    Map | Priority List | Simulation Panel
                    |  Data Access Module (single interface hiding the source)
BUSINESS        Scoring Module (pure functions, client side)
                AI Service (typology + projection, deployed separately)
DATA            data.json | population.json | settings.json
                    |  Data Preparation Script
EXTERNAL        Overpass API (OpenStreetMap) | TurkStat address-based population registry
                [ IoT sensor network, Phase 2, not implemented ]
```

Two decisions carry most of the design:

**Data source abstraction.** The interface never reads a file directly; it asks a single
access module. Today that module is backed by a static file. When the sensor network is
introduced, not a line of the presentation layer changes.

**Degraded mode.** The system does not break when the AI service is unreachable. Model
outputs are embedded into the dataset during data preparation, so if the service is down the
interface keeps working from those values and flags them as stale. With a fixed delivery
date, this was a precondition for adding the AI layer at all.

## Stack

| Layer | Choice |
|---|---|
| Data preparation | Python, `requests`, `shapely` |
| AI service | Python, `scikit-learn` |
| Interface | React, TypeScript, Vite, Tailwind |
| Map and charts | Leaflet, Recharts |
| Deployment | Static build; AI service deployed separately |

## Process documentation

What distinguishes this project is not the map, it is the process behind it. Every decision
is traceable through a chain of identifiers:

```
CR-nn      ->  REQ-nn        ->  ARC-nn        ->  TC-nn
raw need       requirement       architecture      test case
                                 component
```

| Document | Process | Contents |
|---|---|---|
| [Project definition](docs/01-project-definition.md) | Project initiation | Scope, phase split, model rationale |
| [Requirements elicitation](docs/02-requirements-elicitation.md) | ENG.1 | 10 raw needs, approval gate, privacy assessment |
| [Baseline agreement](docs/03-baseline-agreement.md) | ENG.1 BP4 | Scope agreement recorded before implementation |
| [Requirements analysis](docs/04-requirements-analysis.md) | ENG.4 | 31 requirements, acceptance criteria, actors and use cases |
| [Architecture design](docs/05-architecture-design.md) | ENG.5 | 10 components, layer model, interface contracts |
| [Project management](docs/06-project-management.md) | MAN.3, MAN.5 | Plan, ownership, 12-item risk register |
| [Test plan](docs/07-test-plan.md) | ENG.7, ENG.8 | 34 test cases, traceability matrix |
| [Configuration management](docs/08-configuration-management.md) | SUP.8, ENG.6, SPL.2 | Version discipline, coding standard, release package |

**Traceability matrix: 31/31.** Every requirement maps to at least one test case. A gap
anywhere in the chain means one of two things: a requirement nobody tests, or a feature
nobody asked for.

These documents are also compiled into a single formal process report, which is delivered to
the municipality and not published here.

## Scope

The system covers Başakşehir's 10 residential neighborhoods. İkitelli OSB is excluded: it is
an organized industrial zone, and comparing it against residential neighborhoods on the same
scale would be misleading.

Deliberately out of scope, with reasons recorded in the requirements documents: satellite
thermal imagery, meteorological temperature data (grid resolution too coarse to separate
neighborhoods), impervious surface ratio (overlaps heavily with building density), and any
person-level vulnerability data.

## Data sources and licensing

| Data | Source |
|---|---|
| Neighborhood boundaries, green cover, buildings | OpenStreetMap via Overpass API |
| Population and historical series | TurkStat address-based population registration system |

OpenStreetMap data is licensed under the **Open Database License (ODbL)**, which carries an
attribution requirement. The derived dataset falls under the same terms. The interface
credits OpenStreetMap contributors, the basemap provider, and TurkStat.

The system never collects or processes person-level data. Everything is aggregated at
neighborhood level; there are no user accounts, no session records, and no location tracking.
