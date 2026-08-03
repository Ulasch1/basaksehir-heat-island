# Urban Heat Island Prioritization System

Deciding **which** neighborhood gets the tree-planting budget, **what kind** of intervention
it needs, and **when** it will need it, from open data.

Built for Başakşehir municipality (İstanbul) as an internship project, with full ISO/IEC
330xx (SPICE) process documentation.

> **Status.** Phase 1 is complete: the data pipeline, scoring module, AI service and
> interface are all implemented and tested. See [Current state](#current-state).

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

**Both density ratios are computed against a settlement envelope, not the raw neighborhood
boundary.** Buffering and merging building footprints (radius configurable, default 100m) and
clipping to the neighborhood boundary excludes the empty land that some neighborhoods carry.
Without this, a neighborhood that is mostly vacant land with a small dense core (Başak: 24.5
km², 71,065 people, 2.3% built-up) reports a green cover ratio of 85.5% and a hazard score of
0.084, which understates the risk to the people who actually live there by diluting the
built-up core with land nobody occupies.

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

**Second known limitation:** the projection is a linear trend, so it cannot anticipate step
changes such as a new housing development coming online. One neighborhood also has a shorter
population series than the rest, and it happens to be the same outlier that anchors the
bottom of the exposure scale. Its projection is treated separately rather than averaged in
as if it were as well-supported as the others.

## The interface

| Capability | What it does |
|---|---|
| Risk map | Neighborhoods colored on a fixed 3-bucket scale (low/medium/high), thresholds read from configuration, not hard-coded |
| Priority list | Sorted by risk by default; can be re-sorted by green-cover deficit or building density for department-specific views. Re-sorting only changes the list's display order, the map, budget calculation and simulations always stay risk-based |
| Detail panel | Breaks a neighborhood's score down into hazard, exposure and their sub-components |
| Intra-neighborhood heat grid | ~100m cells inside a neighborhood's settlement envelope, colored on a separate, neighborhood-local scale, for finding which corner of a neighborhood needs the intervention, not just which neighborhood |
| Three simulations | Green cover increase (with a modeled building-density offset), population growth (rescales exposure for every neighborhood, not just the one edited), and budget-constrained selection (top N neighborhoods by risk, with % of total risk covered) |
| Neighborhood search | Type-ahead filter that jumps the map, list and detail panel to a match |
| Export | Priority list as CSV, an open heat grid as GeoJSON (flagged when a simulation is active) |
| Degraded-mode indicator | Typology and projection values are marked stale, with the timestamp and service version they came from, whenever the AI service is unreachable |

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
| Interface | React, TypeScript, Vite, Tailwind, Framer Motion |
| Map and charts | Leaflet, Recharts |
| Deployment | Static build; AI service deployed separately |

## Current state

| Component | State |
|---|---|
| Data preparation script | **Implemented.** Pulls boundaries, green cover and buildings from Overpass, joins population by TurkStat code, computes the settlement envelope and the intra-neighborhood heat grid, embeds a cached AI snapshot for degraded mode |
| Scoring module | **Implemented.** Pure TypeScript, no DOM, network or file access. Covers hazard, exposure scaling, risk, all three simulations and budget-constrained selection |
| AI service | **Implemented.** Flask HTTP service, k-means typology clustering and linear-trend population projection, deployed independently of the interface |
| Interface | **Implemented.** Map, priority list, detail panel, simulation panel, intra-neighborhood heat grid, neighborhood search, CSV/GeoJSON export and department-focused sort modes |
| IoT sensor network | Phase 2, deliberately not implemented |

## Quick start

Two processes run side by side: the AI service and the web interface. The interface still
works with the AI service off, it just falls back to the cached snapshot.

```bash
cd servis && pip install -r requirements.txt && python uygulama.py
```

```bash
cd web && npm install && npm run dev
```

The interface opens at `http://localhost:5173` and expects the AI service at
`http://localhost:8000`.

To run the test suites:

```bash
cd web && npm test
cd servis && python -m pytest
cd veri && python -m pytest
```

The scoring module is deliberately the first thing built and the only place the formulas
live. Neither the preparation script nor the AI service reimplements them, so there is no
second copy to drift out of sync.

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
| Project definition | Project initiation | Scope, phase split, model rationale |
| Requirements elicitation | ENG.1 | 10 raw needs, approval gate, privacy assessment |
| Baseline agreement | ENG.1 BP4 | Scope agreement recorded before implementation |
| Requirements analysis | ENG.4 | 36 requirements, acceptance criteria, actors and use cases |
| Architecture design | ENG.5 | 12 components, layer model, interface contracts |
| Project management | MAN.3, MAN.5 | Plan, ownership, 13-item risk register |
| Test plan | ENG.7, ENG.8 | 40 test cases, traceability matrix |
| Configuration management | SUP.8, ENG.6, SPL.2 | Version discipline, coding standard, release package |

**Traceability matrix: 36/36.** Every requirement maps to at least one test case. A gap
anywhere in the chain means one of two things: a requirement nobody tests, or a feature
nobody asked for.

These documents are written in Turkish and compiled into a single formal process report
delivered to the municipality. Neither the documents nor the report are published in this
repository; this repository holds the system's source.

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

Both sources were verified against live data before any pipeline code was written. Three
findings changed the design, and all three fail silently rather than loudly, which is why
they were worth a day of checking:

**Neighborhood boundaries are at `admin_level=8`, not `10`.** The common convention for
Turkish neighborhoods is level 10. Querying level 10 for this district returns zero results
and no error. Level 8 returns 11 polygons: the 10 residential neighborhoods plus the
excluded industrial zone.

**The `place` nodes are a trap.** Querying `place=suburb|quarter` returns 17 results, which
looks better until you notice they are points, so no area ratio can be computed from them,
and six of them are not official neighborhoods at all. A pipeline built on that source
produces a plausible-looking wrong answer.

**Historical population must be joined on TurkStat's numeric code, not the name.**
Neighborhood names changed over the years while their codes did not: `40357` was *Esenler
Başakşehir* in 2008 and is *Başak* today, and *Bahçeşehir 1./2. Kısım* were recorded without
the *Bahçeşehir* prefix. Joining a time series by name breaks 4 of the 10 neighborhoods,
leaving gaps that quietly distort the projection. The series itself runs 2008 to 2025; it
cannot start earlier because the district was founded in 2008.

OpenStreetMap data is licensed under the **Open Database License (ODbL)**, which carries an
attribution requirement. The derived dataset falls under the same terms. The interface
credits OpenStreetMap contributors, the basemap provider, and TurkStat.

The system never collects or processes person-level data. Everything is aggregated at
neighborhood level; there are no user accounts, no session records, and no location tracking.
