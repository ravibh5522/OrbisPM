# OrbisPM — Advanced Analytics, Predictions & Performance Deep Research

> **Purpose**: Comprehensive brainstorm for transforming OrbisPM from a task tracker into an **intelligence-driven project management platform** with predictive analytics, anomaly detection, performance scoring, and executive reporting.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [60 KPIs — Organized by Domain](#2-60-kpis--organized-by-domain)
3. [55 Algorithms & Techniques](#3-55-algorithms--techniques)
4. [Enhanced Dashboard Design](#4-enhanced-dashboard-design)
5. [Performance Side Panel Design](#5-performance-side-panel-design)
6. [Activity Logging System (Comprehensive)](#6-activity-logging-system)
7. [Data Pipeline Architecture](#7-data-pipeline-architecture)
8. [Database Schema Additions](#8-database-schema-additions)
9. [Implementation Roadmap](#9-implementation-roadmap)

---

## 1. Current State Assessment

### What We Already Have (Data Sources)

| Source                                           | Fields Available                                                                                                                                | Analytics Potential                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **tasks**                                        | status, priority, due_date, start_date, estimated_hours, actual_hours, labels, assignee_ids[], created_at, updated_at, depth, progress, version | Throughput, cycle time, estimation accuracy, overdue rate    |
| **activity_log**                                 | entity_type, action, actor_id, changes (JSONB), metadata, created_at                                                                            | User activity patterns, change frequency, audit trails       |
| **comments**                                     | task_id, user_id, parent_id (threads), created_at                                                                                               | Collaboration metrics, response times, communication density |
| **checklists**                                   | task_id, is_completed, position                                                                                                                 | Completion patterns, granularity metrics                     |
| **task_dependencies**                            | task_id, depends_on_task_id, dependency_type                                                                                                    | Critical path, bottleneck detection, DAG analysis            |
| **task_change_requests**                         | status (pending/approved/rejected), reviewer_id, created_at                                                                                     | Review throughput, approval latency, rejection rate          |
| **org_members / team_members / project_members** | role, joined_at                                                                                                                                 | Tenure, role distribution, team composition                  |
| **team_manager_history**                         | old_manager_id, new_manager_id, changed_at, reason                                                                                              | Leadership stability, transition impact                      |
| **notifications**                                | read_at vs created_at                                                                                                                           | Engagement, response latency                                 |
| **attachments**                                  | entity_type, mime_type, size_bytes                                                                                                              | Documentation density                                        |

### Current Dashboard Gaps

1. **No time-series trending** — Only "last 7 days" snapshots, no historical curves
2. **No predictions** — No forecasting for delivery dates, risk, or burnout
3. **No team/user performance scoring** — Only raw workload counts
4. **No comparative analytics** — Can't compare teams, sprints, or time periods
5. **No anomaly detection** — No alerts for unusual patterns
6. **No flow metrics** — No cycle time, lead time, throughput velocity
7. **No estimation analysis** — estimated_hours vs actual_hours not analyzed
8. **No dependency insights** — Critical path not calculated
9. **No engagement/collaboration metrics** — Comment & review patterns unused
10. **No executive summary/reports** — No exportable reports or scorecards

---

## 2. 60 KPIs — Organized by Domain

### A. Task Flow & Throughput KPIs (1–12)

| #   | KPI                        | Formula                                                         | Why It Matters                                            |
| --- | -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | **Throughput**             | Tasks completed per day/week/sprint                             | Core productivity measure — are we delivering?            |
| 2   | **Cycle Time**             | `completed_at - first_moved_to_in_progress` (from activity_log) | How long tasks take once started — efficiency indicator   |
| 3   | **Lead Time**              | `completed_at - created_at`                                     | Total time from creation to delivery — client perspective |
| 4   | **WIP (Work in Progress)** | Count of tasks with `status = 'in_progress'` at any point       | Excess WIP → context switching → slower delivery          |
| 5   | **WIP Age**                | `now() - first_moved_to_in_progress` for open tasks             | Stale WIP indicates blocked or abandoned work             |
| 6   | **Flow Efficiency**        | `active_work_time / lead_time × 100`                            | % of lead time spent actively working vs waiting          |
| 7   | **Blocked Time Ratio**     | `time_in_blocked / total_lead_time × 100`                       | How much time is lost to blockers                         |
| 8   | **Task Arrival Rate**      | Tasks created per day/week                                      | Demand signal — is intake stable or spiking?              |
| 9   | **Task Completion Rate**   | `completed / total × 100` over period                           | Core delivery metric                                      |
| 10  | **Net Flow**               | `tasks_completed - tasks_created` per period                    | Positive = reducing backlog, negative = growing debt      |
| 11  | **Backlog Growth Rate**    | `(backlog_end - backlog_start) / backlog_start × 100`           | Is the backlog under control?                             |
| 12  | **Reopen Rate**            | `tasks_moved_from_done_back_to_open / total_completed × 100`    | Quality signal — are "done" tasks truly done?             |

### B. Schedule & Delivery KPIs (13–22)

| #   | KPI                                  | Formula                                                   | Why It Matters                                       |
| --- | ------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| 13  | **On-Time Delivery Rate**            | `tasks_completed_by_due_date / tasks_with_due_date × 100` | Schedule reliability — trust signal for stakeholders |
| 14  | **Overdue Task Count**               | `WHERE status != 'done' AND due_date < now()`             | Immediate action items                               |
| 15  | **Overdue Severity Score**           | `SUM(days_overdue × priority_weight)`                     | Weighted severity — critical overdue > low overdue   |
| 16  | **Average Days Overdue**             | `AVG(now() - due_date)` for overdue tasks                 | How badly are we missing deadlines?                  |
| 17  | **Schedule Variance (SV)**           | `earned_value - planned_value` (EVM)                      | Are we ahead or behind plan?                         |
| 18  | **Schedule Performance Index (SPI)** | `earned_value / planned_value`                            | SPI < 1.0 = behind schedule                          |
| 19  | **Delivery Predictability**          | StdDev of cycle times — lower = more predictable          | Can stakeholders trust our estimates?                |
| 20  | **Sprint Commitment Accuracy**       | `completed_in_sprint / committed_at_sprint_start × 100`   | Are teams over-committing?                           |
| 21  | **Due Date Coverage**                | `tasks_with_due_date / total_tasks × 100`                 | Planning discipline metric                           |
| 22  | **Deadline Risk Score**              | ML-predicted probability of missing deadline per task     | Proactive — fix before it's late                     |

### C. Estimation & Effort KPIs (23–32)

| #   | KPI                              | Formula                                                 | Why It Matters                                       |
| --- | -------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| 23  | **Estimation Accuracy**          | `actual_hours / estimated_hours` (ratio, 1.0 = perfect) | Are we good at estimating?                           |
| 24  | **Estimation Bias**              | `AVG(actual - estimated)` — positive = under-estimate   | Systematic direction of errors                       |
| 25  | **Estimation Variance**          | StdDev of `(actual - estimated)`                        | Consistency of estimates                             |
| 26  | **Cost Performance Index (CPI)** | `earned_value / actual_cost`                            | CPI < 1.0 = over budget                              |
| 27  | **Effort Concentration**         | Gini coefficient of hours across tasks                  | Are effort hours evenly distributed or concentrated? |
| 28  | **Hours Logged Rate**            | `tasks_with_actual_hours / total_completed × 100`       | Time tracking discipline                             |
| 29  | **Average Effort per Task**      | `AVG(actual_hours)` by priority/type                    | Baseline for future estimation                       |
| 30  | **Effort Escalation Factor**     | `subtask_total_hours / parent_estimated_hours`          | Do subtasks reveal hidden complexity?                |
| 31  | **Idle Hours**                   | `available_capacity - actual_hours_logged`              | Under-utilization detection                          |
| 32  | **Overtime Indicator**           | `actual_hours > (8h × workdays)` per user per week      | Burnout early warning                                |

### D. Quality & Rework KPIs (33–40)

| #   | KPI                                | Formula                                                   | Why It Matters                       |
| --- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| 33  | **Rework Rate**                    | `tasks_reopened / tasks_completed × 100`                  | Higher rework = lower quality output |
| 34  | **Review Rejection Rate**          | `change_requests_rejected / change_requests_total × 100`  | Code/task quality before merge       |
| 35  | **Review Turnaround Time**         | `AVG(reviewed_at - created_at)` for change_requests       | Slow reviews block delivery          |
| 36  | **First-Time Pass Rate**           | `tasks_approved_without_rejection / tasks_reviewed × 100` | Quality at first submission          |
| 37  | **Checklist Completion Rate**      | `completed_items / total_items × 100` at task completion  | Are tasks truly finished?            |
| 38  | **Subtask Completion Consistency** | StdDev of subtask completion times within parent          | Predictability of sub-deliverables   |
| 39  | **Bug/Issue Injection Rate**       | Tasks tagged as bug created per period                    | Are we creating more problems?       |
| 40  | **Defect Removal Efficiency**      | `bugs_fixed / (bugs_fixed + bugs_remaining) × 100`        | Quality convergence metric           |

### E. Team & Collaboration KPIs (41–50)

| #   | KPI                                         | Formula                                               | Why It Matters                            |
| --- | ------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| 41  | **Team Velocity**                           | Story points or task count completed per sprint/week  | Capacity & delivery speed                 |
| 42  | **Capacity Utilization**                    | `actual_hours / (members × available_hours) × 100`    | Is the team fully utilized?               |
| 43  | **Workload Balance (Gini)**                 | Gini coefficient of tasks per assignee                | Imbalanced = some overloaded, others idle |
| 44  | **Collaboration Index**                     | `tasks_with_multiple_assignees / total × 100`         | Cross-functional work frequency           |
| 45  | **Comment Density**                         | `AVG(comments per task)`                              | Communication health — too low = siloed   |
| 46  | **Response Time**                           | `AVG(first_reply_at - comment_created_at)` in threads | Team responsiveness                       |
| 47  | **Bus Factor**                              | Minimum assignees covering 50% of tasks               | Knowledge concentration risk              |
| 48  | **Member Contribution Variance**            | StdDev of tasks completed per member                  | Equity of output                          |
| 49  | **Cross-Team Dependency Count**             | Tasks with dependencies spanning teams                | Integration risk                          |
| 50  | **Meeting Tax** (if time entries are typed) | `meeting_hours / total_hours × 100`                   | Overhead vs productive work               |

### F. Individual Performance KPIs (51–55)

| #   | KPI                                | Formula                                                       | Why It Matters                          |
| --- | ---------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| 51  | **Personal Throughput**            | Tasks completed per week (with trend)                         | Individual productivity with trajectory |
| 52  | **Personal Cycle Time**            | User's median cycle time vs team median                       | Speed relative to peers                 |
| 53  | **Estimation Accuracy (Personal)** | User's actual/estimated ratio vs team avg                     | Individual estimation skill             |
| 54  | **Review Quality Score**           | `approved_without_re-review / total_reviewed` as reviewer     | Effectiveness as reviewer               |
| 55  | **Engagement Score**               | Composite: logins, comments, task updates, notification reads | Overall platform engagement             |

### G. Predictive & Health KPIs (56–60)

| #   | KPI                       | Formula                                                              | Why It Matters                             |
| --- | ------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| 56  | **Project Health Score**  | Weighted composite: SPI + CPI + overdue% + blocked% + velocity trend | Single number (0–100) for executives       |
| 57  | **Burnout Risk Score**    | `overtime + monotask + no_breaks + high_wip + declining_throughput`  | Proactive people care                      |
| 58  | **Delivery Confidence**   | Monte Carlo simulation success rate at target date                   | "85% chance of finishing by March 30"      |
| 59  | **Risk Score (per task)** | ML: complexity + dependency count + assignee load + days_to_due      | Flagging at-risk tasks before they're late |
| 60  | **Scope Creep Index**     | `(current_task_count - original_count) / original_count × 100`       | Is scope expanding uncontrolled?           |

---

## 3. 55 Algorithms & Techniques

### A. Time-Series & Forecasting (1–10)

| #   | Algorithm                                            | Application in OrbisPM                                                     | Complexity |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| 1   | **Exponential Moving Average (EMA)**                 | Smooth throughput/velocity trends, remove noise                            | Low        |
| 2   | **Simple Linear Regression**                         | Predict completion date from burn-down slope                               | Low        |
| 3   | **Monte Carlo Simulation**                           | Delivery date confidence intervals using historical cycle times            | Medium     |
| 4   | **ARIMA (AutoRegressive Integrated Moving Average)** | Forecast task creation rate, resource demand                               | Medium     |
| 5   | **Holt-Winters (Triple Exponential Smoothing)**      | Seasonal throughput patterns (sprints, quarters, holidays)                 | Medium     |
| 6   | **Prophet (Facebook)**                               | Auto-detect seasonality + trend in task flow data                          | Medium     |
| 7   | **Bayesian Estimation**                              | Update delivery estimates as new data arrives (sprint-over-sprint)         | Medium     |
| 8   | **Kalman Filter**                                    | Continuous estimation refinement for project velocity                      | High       |
| 9   | **Survival Analysis (Kaplan-Meier)**                 | "What's the probability this task stays open > 14 days?"                   | Medium     |
| 10  | **Cumulative Flow Diagram (CFD) Analysis**           | Visual + algorithmic analysis of WIP, throughput, lead time simultaneously | Low        |

### B. Anomaly Detection & Alerts (11–18)

| #   | Algorithm                                  | Application                                                                 | Complexity |
| --- | ------------------------------------------ | --------------------------------------------------------------------------- | ---------- |
| 11  | **Z-Score / Modified Z-Score**             | Flag tasks or users with cycle times > 2σ from mean                         | Low        |
| 12  | **IQR (Interquartile Range) Method**       | Outlier detection for estimation accuracy, effort per task                  | Low        |
| 13  | **CUSUM (Cumulative Sum)**                 | Detect shift in throughput trend (team slowing down)                        | Low        |
| 14  | **Control Charts (Shewhart)**              | Cycle time / lead time control limits — alert when out of bounds            | Low        |
| 15  | **Isolation Forest**                       | Multi-dimensional outlier: (cycle_time, effort, priority, dependency_count) | Medium     |
| 16  | **DBSCAN Clustering**                      | Discover abnormal task clusters (too many blocked, too many critical)       | Medium     |
| 17  | **Seasonal Decomposition (STL)**           | Separate trend/seasonal/residual in weekly patterns to find true anomalies  | Medium     |
| 18  | **Exponentially Weighted Moving Variance** | Real-time variance tracking for throughput spikes/drops                     | Low        |

### C. Classification & Risk Scoring (19–28)

| #   | Algorithm                                     | Application                                                                                                                   | Complexity |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 19  | **Logistic Regression**                       | Binary: will this task miss its deadline? (features: age, priority, assignee load, dependency count)                          | Low        |
| 20  | **Random Forest Classifier**                  | Multi-class risk: low/medium/high/critical risk per task                                                                      | Medium     |
| 21  | **Gradient Boosted Trees (XGBoost/LightGBM)** | Best accuracy for deadline risk, effort estimation                                                                            | Medium     |
| 22  | **Naive Bayes**                               | Quick priority auto-suggestion based on task title + description keywords                                                     | Low        |
| 23  | **Decision Tree (CART)**                      | Explainable rules: "Tasks with >3 dependencies AND no assignee have 80% overdue rate"                                         | Low        |
| 24  | **Support Vector Machine (SVM)**              | Task categorization (feature request vs bug vs improvement) from text                                                         | Medium     |
| 25  | **Rule-Based Scoring (Weighted Sum)**         | Simple risk score: `0.3×overdue_risk + 0.2×dependency_risk + 0.2×workload_risk + 0.15×complexity_risk + 0.15×estimation_risk` | Low        |
| 26  | **Bayesian Network**                          | Causal model: "If review is rejected AND assignee is overloaded → 73% chance of deadline miss"                                | High       |
| 27  | **k-Nearest Neighbors (kNN)**                 | Find similar historical tasks to predict effort/duration                                                                      | Low        |
| 28  | **Ensemble Stacking**                         | Combine multiple classifiers for best risk prediction                                                                         | High       |

### D. Clustering & Segmentation (29–35)

| #   | Algorithm                                   | Application                                                              | Complexity |
| --- | ------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| 29  | **K-Means Clustering**                      | Group users by work patterns (early-bird, night-owl, consistent, bursty) | Low        |
| 30  | **Hierarchical Clustering (Agglomerative)** | Team similarity dendrograms — which teams work alike?                    | Medium     |
| 31  | **DBSCAN**                                  | Discover natural task groupings by complexity/effort without preset K    | Medium     |
| 32  | **Gaussian Mixture Models (GMM)**           | Soft clustering of task types for better estimation buckets              | Medium     |
| 33  | **Latent Dirichlet Allocation (LDA)**       | Topic discovery in task descriptions — auto-labeling                     | Medium     |
| 34  | **t-SNE / UMAP**                            | 2D visualization of task/user similarity for exploration dashboards      | Medium     |
| 35  | **Cohort Analysis**                         | Group users by join date → track engagement/performance over time        | Low        |

### E. Graph & Network Algorithms (36–43)

| #   | Algorithm                         | Application                                                    | Complexity |
| --- | --------------------------------- | -------------------------------------------------------------- | ---------- |
| 36  | **Critical Path Method (CPM)**    | Find longest dependency chain → project minimum duration       | Medium     |
| 37  | **Topological Sort**              | Determine correct task execution order from DAG                | Low        |
| 38  | **PageRank**                      | Identify most "important" tasks (most depended-upon)           | Medium     |
| 39  | **Betweenness Centrality**        | Find bottleneck tasks that, if blocked, cascade to most others | Medium     |
| 40  | **Shortest Path (Dijkstra)**      | Fastest route to project completion considering effort weights | Medium     |
| 41  | **Network Flow (Max-Flow)**       | Resource allocation — distribute capacity across project paths | High       |
| 42  | **Community Detection (Louvain)** | Discover natural work clusters in collaboration graphs         | Medium     |
| 43  | **Cycle Detection (DFS)**         | Find circular dependencies in task DAG — prevent deadlocks     | Low        |

### F. Optimization & Scheduling (44–49)

| #   | Algorithm                                  | Application                                                                         | Complexity |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------- | ---------- |
| 44  | **Hungarian Algorithm**                    | Optimal task-to-assignee matching (minimize total cost/time)                        | Medium     |
| 45  | **Genetic Algorithm**                      | Multi-objective sprint planning (maximize value, minimize risk, balance load)       | High       |
| 46  | **Simulated Annealing**                    | Near-optimal task scheduling with constraints (due dates, dependencies, capacity)   | High       |
| 47  | **Greedy Scheduling**                      | Simple priority-based task ordering for sprint planning                             | Low        |
| 48  | **Linear Programming (LP)**                | Resource allocation under constraints (budget, time, people)                        | Medium     |
| 49  | **Multi-Armed Bandit (Thompson Sampling)** | Experiment with different team configurations, measure which yields best throughput | High       |

### G. NLP & Text Analytics (50–55)

| #   | Algorithm                                          | Application                                                      | Complexity |
| --- | -------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| 50  | **TF-IDF + Cosine Similarity**                     | Find duplicate/similar tasks, smart task search                  | Low        |
| 51  | **Sentiment Analysis (VADER / fine-tuned)**        | Detect frustration in comments → team morale metric              | Medium     |
| 52  | **Named Entity Recognition (NER)**                 | Auto-extract mentioned people, projects, dates from descriptions | Medium     |
| 53  | **Text Summarization (extractive)**                | Auto-generate sprint/project summaries from task descriptions    | Medium     |
| 54  | **Keyword Extraction (RAKE/TextRank)**             | Auto-suggest labels from task content                            | Low        |
| 55  | **Embedding-based Search (sentence-transformers)** | Semantic task search "find tasks about authentication"           | Medium     |

---

## 4. Enhanced Dashboard Design

### 4.1 Dashboard Redesign — 4 Tiers

```
┌─────────────────────────────────────────────────────────────┐
│                    ORG EXECUTIVE DASHBOARD                    │
│                                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │ Health  │ │Delivery │ │  Team   │ │ Risk    │ │ Scope  ││
│  │ Score   │ │ Rate    │ │Velocity │ │Alerts   │ │ Creep  ││
│  │  78/100 │ │  87%    │ │ ↑12%    │ │ 3 ⚠️    │ │ +5%    ││
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘│
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │  VELOCITY TREND      │  │  CUMULATIVE FLOW DIAGRAM     │  │
│  │  (12-week sparkline) │  │  (todo/progress/done stacked)│  │
│  │  ~~~~~~~~↗           │  │  ▓▓▓▓▓▓▓▓▓▓░░░░░░░           │  │
│  └──────────────────────┘  └──────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │  PREDICTION PANEL    │  │  WARNINGS & ISSUES           │  │
│  │  📅 Delivery: Mar 28 │  │  ⚠️ 5 tasks overdue >7 days  │  │
│  │  📊 Confidence: 82%  │  │  🔴 Team Alpha velocity ↓23% │  │
│  │  🎯 Scope: 94% done  │  │  🟡 3 tasks blocked >3 days  │  │
│  │  by target date      │  │  🟡 User X workload: 150%    │  │
│  └──────────────────────┘  │  🔵 Review backlog: 8 tasks  │  │
│                             └──────────────────────────────┘  │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  PROJECT HEALTH MATRIX (heatmap by project×metric)       ││
│  │  ┌──────────┬────┬────┬────┬────┬────┐                   ││
│  │  │ Project  │ SPI│ OTD│ Vel│Risk│Qual│                   ││
│  │  ├──────────┼────┼────┼────┼────┼────┤                   ││
│  │  │ Backend  │ 🟢 │ 🟢 │ 🟡 │ 🟢 │ 🟢 │                   ││
│  │  │ Frontend │ 🟡 │ 🔴 │ 🟢 │ 🟡 │ 🟢 │                   ││
│  │  │ Mobile   │ 🔴 │ 🔴 │ 🔴 │ 🔴 │ 🟡 │                   ││
│  │  └──────────┴────┴────┴────┴────┴────┘                   ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Dashboard Widget Specifications

#### Widget 1: Health Score Ring (0–100)

- **Inputs**: SPI, on-time rate, blocked ratio, velocity trend, overdue count
- **Algorithm**: Weighted composite (#25 Rule-Based Scoring)
- **Visual**: Animated donut chart with color gradient (red < 40, yellow 40–70, green > 70)
- **Drill-down**: Click → breakdown of each sub-score

#### Widget 2: Prediction Panel

- **Delivery Date**: Monte Carlo simulation (#3) using last 30 days of cycle times
- **Confidence Band**: P25 / P50 / P75 / P95 dates shown
- **Scope Tracking**: Earned Value calculation with forecast line
- **Visual**: Timeline with confidence cone

#### Widget 3: Warnings & Issues (Auto-Generated)

```
Priority-ranked list generated by rule engine:

CRITICAL:
- "Project X has 0% chance of meeting Apr 15 deadline" (Monte Carlo)
- "User Y has logged 60h in 5 days — burnout risk HIGH" (Z-score)

HIGH:
- "Team Z velocity dropped 30% for 3 consecutive weeks" (CUSUM)
- "8 tasks blocked for >5 days — review bottleneck detected" (Control Chart)

MEDIUM:
- "Estimation accuracy for Python tasks is 0.4 (severe under-estimation)" (bias analysis)
- "Project A scope grew 25% since sprint start" (scope creep index)

LOW:
- "3 tasks have circular dependencies" (cycle detection)
- "Comment density dropped 40% — collaboration declining" (trend)
```

#### Widget 4: Velocity Trend Chart

- **Data**: Weekly/sprint throughput over 12+ periods
- **Overlays**: EMA trend line (#1), control limits (#14), forecast (#2)
- **Visual**: Area chart with confidence band

#### Widget 5: Cumulative Flow Diagram (CFD)

- **Data**: Daily snapshots of tasks in each status
- **Insight**: Visual bands show WIP, throughput, lead time at once
- **Visual**: Stacked area chart (todo, in_progress, blocked, done)

#### Widget 6: Project Health Heatmap

- **Data**: All projects scored on 5–8 metrics
- **Visual**: Matrix heatmap (project × metric), color-coded cells
- **Drill-down**: Click cell → detailed metric for that project

#### Widget 7: Burn-Down / Burn-Up Chart (Enhanced)

- **Current**: Basic burndown_data (30 days, project-level)
- **Enhanced**: Ideal line + actual line + forecast line (with cone of uncertainty)
- **Algorithm**: Linear regression for trend, Monte Carlo for cone

#### Widget 8: At-Risk Tasks Table

- **Data**: Tasks ranked by risk score (#59 composite or #20 Random Forest)
- **Columns**: Task, Risk Score, Days to Due, Assignee Load, Dependency Count, Predicted Completion
- **Actions**: Reassign, extend deadline, add resources (inline)

#### Widget 9: Team Workload Balance

- **Current**: member_workload (counts only)
- **Enhanced**: Horizontal bar chart showing each member's load as % of capacity
- **Algorithm**: Gini coefficient (#43) shown as single number + balance indicator
- **Color**: Red if Gini > 0.4 (highly imbalanced)

#### Widget 10: Activity Heatmap

- **Data**: Activity events per hour per day-of-week (GitHub-style)
- **Visual**: 7×24 heatmap grid
- **Insight**: When is the team most active? Peak hours? Dead zones?

#### Widget 11: Estimation Accuracy Scatter

- **Data**: Estimated vs actual hours per task
- **Visual**: Scatter plot with y=x reference line
- **Insight**: Points above line = under-estimated, below = over-estimated
- **Algorithm**: Linear regression shows systematic bias

#### Widget 12: Quick Insights AI Panel

- **Format**: Natural language summaries generated from KPI calculations
- **Examples**:
  - "This week: 23 tasks completed (↑15% from last week). Top contributor: Alice (8 tasks)."
  - "Warning: Average cycle time increased from 3.2 to 4.7 days. 60% due to review delays."
  - "Prediction: At current velocity, Project X will complete 2 days before deadline."

---

## 5. Performance Side Panel Design

### 5.1 Navigation Structure

```
📊 Dashboard
📁 Projects
👥 Teams
📋 My Tasks
🔔 Notifications
🔍 Search
──────────────────
📈 Performance          ← NEW SECTION
   ├── 🏢 Organization
   ├── 📁 Projects
   ├── 👥 Teams
   ├── 👤 Members
   ├── 📊 Comparisons
   └── 📄 Reports
──────────────────
⚙️ Settings
...
```

### 5.2 Performance > Organization Overview

```
/[orgSlug]/performance/

┌─────────────────────────────────────────────────────────────┐
│  ORGANIZATION PERFORMANCE OVERVIEW                          │
│                                                               │
│  Time Range: [Last 7d ▾] [Last 30d] [Last 90d] [Custom]     │
│                                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Throughput│ │Avg Cycle│ │On-Time  │ │ Active  │           │
│  │ 142/wk  │ │ 3.2 days│ │  87%    │ │ Members │           │
│  │  ↑12%   │ │  ↓0.5d  │ │  ↑3%    │ │  24/28  │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                               │
│  [THROUGHPUT TREND - 12 week area chart]                     │
│  [CYCLE TIME DISTRIBUTION - histogram with percentiles]      │
│  [FLOW EFFICIENCY - trend line over weeks]                   │
│  [TOP CONTRIBUTORS TABLE - with sparklines]                  │
│  [ESTIMATION ACCURACY - box plot by project/team]            │
│  [ACTIVITY HEATMAP - GitHub-style contribution grid]         │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Performance > Projects Deep Dive

```
/[orgSlug]/performance/projects/[projectId]

SECTIONS:
1. PROJECT SCORECARD
   - Health Score (0-100 ring)
   - SPI, CPI gauges
   - Delivery Confidence (Monte Carlo)
   - Risk Summary (critical/high/medium/low counts)

2. VELOCITY & THROUGHPUT
   - Sprint-over-sprint velocity chart
   - Throughput histogram (tasks/week distribution)
   - Throughput forecast (next 4 weeks with confidence)

3. FLOW METRICS
   - Cycle Time trend + control chart
   - Lead Time trend + percentiles (P50, P85, P95)
   - WIP over time — with recommended WIP limit line
   - CFD (Cumulative Flow Diagram)
   - Flow Efficiency trend

4. SCHEDULE & DELIVERY
   - Burndown chart with Monte Carlo forecast cone
   - On-time delivery rate trend
   - Overdue task age distribution (histogram)
   - Gantt chart with critical path highlighted (from CPM)

5. ESTIMATION ANALYSIS
   - Accuracy scatter (estimated vs actual)
   - Accuracy trend over time (improving or degrading?)
   - Accuracy by task type/priority/assignee
   - Under/over estimation distribution

6. QUALITY METRICS
   - Rework/reopen rate trend
   - Review rejection rate trend
   - Checklist completion rate trend
   - First-time pass rate

7. DEPENDENCIES & RISK
   - Dependency graph (interactive DAG visualization)
   - Critical path highlighted in red
   - Bottleneck tasks (highest betweenness centrality)
   - Blocked task heatmap (blocked duration × priority)

8. TEAM CONTRIBUTION (within project)
   - Member throughput comparison (bar chart)
   - Workload balance (Gini coefficient gauge)
   - Bus factor visualization
   - Contribution timeline (who did what, when)
```

### 5.4 Performance > Teams Deep Dive

```
/[orgSlug]/performance/teams/[teamId]

SECTIONS:
1. TEAM SCORECARD
   - Velocity (with trend arrow)
   - Capacity Utilization %
   - On-time Delivery %
   - Collaboration Index
   - Team Health Score

2. VELOCITY & CAPACITY
   - Velocity trend (sprint/week)
   - Capacity planning view (available vs allocated vs actual)
   - Sprint commitment vs delivery (accuracy %)

3. MEMBER WORKLOAD ANALYSIS
   - Workload distribution chart (stacked bar per member)
   - Balance score (Gini coefficient)
   - Individual contribution trends
   - Burnout risk indicators per member

4. CROSS-TEAM METRICS
   - Dependencies on other teams (count + blocking time)
   - Collaboration edges (who works with whom across teams)
   - Shared project performance

5. MANAGER EFFECTIVENESS (if team has lead)
   - Review turnaround time
   - Task assignment balance
   - Team velocity under this manager vs previous (from team_manager_history)

6. COMPARATIVE ANALYSIS
   - This team vs org average (radar chart)
   - Trend comparison with other teams (anonymized or if admin)
```

### 5.5 Performance > Members (Individual Analytics)

```
/[orgSlug]/performance/members/[userId]

SECTIONS:
1. PERSONAL SCORECARD
   - Tasks Completed (trend)
   - Avg Cycle Time (vs team median)
   - Estimation Accuracy (vs team avg)
   - Review Quality Score
   - Engagement Score

2. PRODUCTIVITY TRENDS
   - Weekly throughput line chart
   - Cycle time trend with control limits
   - Tasks by status over time (small multiples)

3. WORK PATTERNS
   - Activity heatmap (day × hour)
   - Peak productivity hours
   - Work distribution by project (pie/sunburst)
   - Task type distribution (bug/feature/improvement)

4. ESTIMATION PROFILE
   - Personal estimation accuracy over time
   - Accuracy by task size / priority
   - Comparison with team average

5. COLLABORATION METRICS
   - Comment frequency and response times
   - Reviews performed (count + turnaround)
   - Co-assignment frequency (who they work with most)

6. GROWTH & DEVELOPMENT
   - Skills heatmap (based on labels/projects worked on)
   - Throughput growth trajectory (quarter over quarter)
   - Estimation improvement trend
   - New area contributions (first-time work in project/label)

NOTE: Individual metrics must respect privacy settings.
Admin view: full detail. Self view: full detail.
Peer view: aggregated only (no individual task breakdown).
```

### 5.6 Performance > Comparisons

```
/[orgSlug]/performance/compare

COMPARISON TYPES:
1. Project vs Project (side-by-side scorecards + overlay charts)
2. Team vs Team (radar chart overlay)
3. Sprint vs Sprint (within project)
4. Period vs Period (Q1 vs Q2, month-over-month)
5. Member vs Team Average (privacy-filtered)

VISUALS:
- Dual-axis charts
- Radar/spider charts
- Side-by-side heatmaps
- Delta tables (metric, A, B, difference, trend)
```

### 5.7 Performance > Reports

```
/[orgSlug]/performance/reports

REPORT TYPES:
1. Weekly Status Report (auto-generated)
   - What was completed
   - What's in progress
   - What's blocked
   - Key metrics summary
   - Next week plan

2. Sprint Retrospective Data Pack
   - Velocity delivered vs committed
   - Estimation accuracy
   - Cycle time distribution
   - Burndown actual vs ideal
   - Rework rate
   - Blockers summary

3. Project Health Report
   - Executive summary (AI-generated paragraph)
   - All KPIs with trend arrows
   - Risk register (auto-populated from risk scoring)
   - Forecasts with confidence

4. Team Performance Report
   - Quarterly team scorecard
   - Workload balance analysis
   - Velocity trend
   - Areas for improvement (auto-suggested)

5. Resource Utilization Report
   - Capacity vs actual across all teams
   - Over/under-utilized members
   - Optimal rebalancing suggestions

EXPORT FORMATS: PDF, CSV, JSON
SCHEDULING: Auto-send weekly/biweekly/monthly via email
```

---

## 6. Activity Logging System

### 6.1 Current State

- `activity_log` table exists with: entity_type, entity_id, action, actor_id, changes (JSONB), metadata (JSONB)
- 27 event types defined
- Immutable, append-only

### 6.2 Enhanced Activity Logging — What to Add

#### New Event Types to Track (40 additional events):

**Task Lifecycle (detailed):**
| Event | Data Captured | Analytics Use |
|-------|--------------|---------------|
| `task.status_transition` | from_status, to_status, duration_in_previous_status | Cycle time, flow metrics |
| `task.assigned` | previous_assignees[], new_assignees[] | Workload tracking, handoff count |
| `task.estimated` | old_estimate, new_estimate, reason | Estimation volatility |
| `task.time_logged` | hours, work_type (dev/review/meeting/admin), date | Effort analytics, work type distribution |
| `task.progress_updated` | old_progress, new_progress | Progress velocity |
| `task.dependency_added` | depends_on_task_id, dependency_type | Dependency graph events |
| `task.dependency_removed` | depends_on_task_id | Unblocking events |
| `task.blocked` | blocker_reason, blocker_task_id | Blocked time tracking |
| `task.unblocked` | resolution, blocked_duration_hours | Unblock patterns |
| `task.label_changed` | added_labels[], removed_labels[] | Label flow analysis |
| `task.due_date_changed` | old_date, new_date, reason | Deadline stability |
| `task.reopened` | reopen_reason | Quality/rework tracking |
| `task.subtask_completed` | parent_task_progress_after | Subtask patterns |

**Review Pipeline:**
| Event | Data Captured | Analytics Use |
|-------|--------------|---------------|
| `review.requested` | reviewer_id, task_id | Review queue tracking |
| `review.started` | reviewer_id, wait_duration | Review waiting time |
| `review.completed` | result (approved/rejected), review_duration, feedback_length | Review quality & speed |
| `review.re_requested` | reason, iteration_number | Rework cycles |

**Collaboration:**
| Event | Data Captured | Analytics Use |
|-------|--------------|---------------|
| `comment.replied` | parent_comment_id, response_time_seconds | Responsiveness |
| `comment.mentioned_user` | mentioned_user_ids[] | Collaboration graph |
| `attachment.uploaded` | size_bytes, mime_type | Documentation patterns |

**Project & Team:**
| Event | Data Captured | Analytics Use |
|-------|--------------|---------------|
| `project.milestone_reached` | milestone_name, planned_date, actual_date | Milestone accuracy |
| `project.scope_changed` | tasks_added, tasks_removed, net_change | Scope creep tracking |
| `team.capacity_changed` | member_added/removed, new_capacity | Capacity planning |
| `team.manager_changed` | old_manager, new_manager, reason | Leadership impact |
| `sprint.started` | committed_tasks, committed_points | Commitment tracking |
| `sprint.completed` | delivered_tasks, delivered_points, carryover | Sprint effectiveness |

**User Activity:**
| Event | Data Captured | Analytics Use |
|-------|--------------|---------------|
| `user.session_started` | device, location_approximate | Engagement tracking |
| `user.page_viewed` | page_type, entity_id, duration_seconds | Usage patterns |
| `user.search_performed` | query, result_count, clicked_result | Search effectiveness |
| `user.notification_read` | notification_id, time_to_read | Alert responsiveness |
| `user.dashboard_viewed` | dashboard_type, filters_applied | Dashboard usage |
| `user.report_generated` | report_type, params | Reporting needs |
| `user.feature_used` | feature_name, context | Feature adoption |

### 6.3 Data Architecture for Analytics

#### Raw Events Table (enhanced activity_log)

```sql
-- Keep existing activity_log for backward compat
-- Add new analytics_events table optimized for time-series queries

CREATE TABLE analytics_events (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,         -- 'task.status_transition', 'user.session_started', etc.
    actor_id    UUID NOT NULL,
    entity_type TEXT NOT NULL,         -- 'task', 'project', 'team', 'user'
    entity_id   UUID NOT NULL,
    project_id  UUID,                  -- denormalized for fast project-scoped queries
    team_id     UUID,                  -- denormalized for fast team-scoped queries
    data        JSONB NOT NULL,        -- event-specific payload
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partitioned by month for performance at scale
-- CREATE TABLE analytics_events ... PARTITION BY RANGE (created_at);

CREATE INDEX idx_analytics_events_org_type_time
    ON analytics_events (org_id, event_type, created_at DESC);
CREATE INDEX idx_analytics_events_entity
    ON analytics_events (org_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_analytics_events_project
    ON analytics_events (org_id, project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX idx_analytics_events_actor
    ON analytics_events (org_id, actor_id, created_at DESC);
CREATE INDEX idx_analytics_events_data
    ON analytics_events USING GIN (data);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_events_isolation ON analytics_events
    USING (org_id = current_setting('app.current_org_id')::UUID);
```

#### Materialized Aggregates (pre-computed daily/weekly/monthly)

```sql
-- Daily snapshots to avoid recomputing from raw events
CREATE TABLE daily_metrics (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    metric_date     DATE NOT NULL,
    scope_type      TEXT NOT NULL,      -- 'org', 'project', 'team', 'user'
    scope_id        UUID NOT NULL,      -- org_id, project_id, team_id, or user_id
    metrics         JSONB NOT NULL,     -- {throughput: 12, cycle_time_p50: 3.2, ...}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, metric_date, scope_type, scope_id)
);

CREATE INDEX idx_daily_metrics_lookup
    ON daily_metrics (org_id, scope_type, scope_id, metric_date DESC);

-- Weekly rollup
CREATE TABLE weekly_metrics (
    -- same structure, metric_date = Monday of the week
);

-- Monthly rollup
CREATE TABLE monthly_metrics (
    -- same structure, metric_date = 1st of the month
);
```

#### Task Status Snapshots (for CFD)

```sql
-- Capture task status distribution daily for Cumulative Flow Diagrams
CREATE TABLE task_status_snapshots (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    todo_count      INT NOT NULL DEFAULT 0,
    in_progress_count INT NOT NULL DEFAULT 0,
    blocked_count   INT NOT NULL DEFAULT 0,
    done_count      INT NOT NULL DEFAULT 0,
    total_count     INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, project_id, snapshot_date)
);
```

#### Task State Transitions (for cycle time)

```sql
-- Record every status change with timestamps for precise cycle time
CREATE TABLE task_state_transitions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_status TEXT,                   -- NULL for creation
    to_status   TEXT NOT NULL,
    actor_id    UUID NOT NULL,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_transitions_task
    ON task_state_transitions (org_id, task_id, transitioned_at);
CREATE INDEX idx_task_transitions_status
    ON task_state_transitions (org_id, to_status, transitioned_at DESC);
```

### 6.4 Background Job Pipeline (Asynq)

```
Event Published (Redis Pub/Sub)
         │
         ▼
┌─────────────────┐
│  Event Router   │  ← subscribes to all domain events
│  (Asynq Worker) │
└──────┬──────────┘
       │
       ├──→ [analytics:log_event]        → INSERT into analytics_events
       ├──→ [analytics:update_metrics]   → Increment daily_metrics counters
       ├──→ [analytics:check_anomalies]  → Run anomaly detection rules
       ├──→ [analytics:update_risk]      → Recalculate task risk scores
       └──→ [analytics:snapshot]         → Daily: task_status_snapshots

Scheduled Jobs (Asynq Scheduler):
  - Daily 00:00 UTC:  [analytics:daily_rollup]      → Compute daily_metrics from analytics_events
  - Daily 00:00 UTC:  [analytics:status_snapshot]    → Snapshot all projects' task status counts
  - Weekly Monday:    [analytics:weekly_rollup]      → Aggregate daily → weekly_metrics
  - Monthly 1st:      [analytics:monthly_rollup]     → Aggregate weekly → monthly_metrics
  - Daily 06:00 UTC:  [analytics:predictions]        → Run Monte Carlo, risk scoring, burnout detection
  - Weekly Monday:    [analytics:weekly_report]       → Generate auto reports, email if subscribed
```

---

## 7. Data Pipeline Architecture

### 7.1 Three-Tier Analytics Architecture

```
TIER 1: REAL-TIME (< 1 second)
├── WebSocket pushes for live dashboard updates
├── Redis-cached current counts (throughput today, WIP now)
├── In-memory KPI computation for dashboard widgets
└── Source: Redis Pub/Sub events → WebSocket hub

TIER 2: NEAR REAL-TIME (1–60 seconds)
├── Asynq background jobs triggered by events
├── Incremental daily_metrics updates
├── Anomaly detection on latest events
├── Risk score recalculation
└── Source: analytics_events table, streaming aggregation

TIER 3: BATCH (hourly/daily/weekly)
├── Daily metric rollups (full recalculation)
├── Monte Carlo simulations (needs historical data)
├── ML model training (risk prediction, estimation)
├── Report generation (PDF/CSV)
├── Trend analysis & forecasting
└── Source: daily_metrics, analytics_events historical
```

### 7.2 Caching Strategy

```
Redis Cache Layers:

1. dashboard:{org_id}:stats          → TTL 60s   (real-time stats)
2. dashboard:{org_id}:predictions    → TTL 1h    (Monte Carlo results)
3. dashboard:{org_id}:warnings       → TTL 5m    (anomaly alerts)
4. performance:{scope}:{id}:daily    → TTL 10m   (daily metrics)
5. performance:{scope}:{id}:weekly   → TTL 1h    (weekly trends)
6. risk:task:{task_id}               → TTL 15m   (per-task risk score)
7. health:project:{project_id}       → TTL 10m   (project health score)
```

### 7.3 API Endpoints (New)

```
# Dashboard (enhanced)
GET /orgs/{orgId}/dashboard/stats           → Enhanced with health score, predictions, warnings
GET /orgs/{orgId}/dashboard/predictions     → Monte Carlo delivery forecasts
GET /orgs/{orgId}/dashboard/warnings        → Auto-generated warnings & issues
GET /orgs/{orgId}/dashboard/health-matrix   → Project health heatmap data
GET /orgs/{orgId}/dashboard/cfd             → Cumulative flow diagram data
GET /orgs/{orgId}/dashboard/velocity        → Velocity trend with forecast

# Performance - Organization
GET /orgs/{orgId}/performance/overview                → Org-level KPIs with trends
GET /orgs/{orgId}/performance/activity-heatmap        → Hour×Day activity matrix

# Performance - Projects
GET /orgs/{orgId}/performance/projects/{projectId}/scorecard    → Health score + sub-metrics
GET /orgs/{orgId}/performance/projects/{projectId}/flow         → Cycle time, lead time, WIP, CFD
GET /orgs/{orgId}/performance/projects/{projectId}/schedule     → SPI, burndown, forecast
GET /orgs/{orgId}/performance/projects/{projectId}/estimation   → Accuracy scatter + trends
GET /orgs/{orgId}/performance/projects/{projectId}/quality      → Rework, review, checklist rates
GET /orgs/{orgId}/performance/projects/{projectId}/dependencies → DAG, critical path, bottlenecks
GET /orgs/{orgId}/performance/projects/{projectId}/risks        → At-risk tasks ranked

# Performance - Teams
GET /orgs/{orgId}/performance/teams/{teamId}/scorecard          → Team health + velocity
GET /orgs/{orgId}/performance/teams/{teamId}/workload           → Member workload balance
GET /orgs/{orgId}/performance/teams/{teamId}/capacity           → Utilization + planning view

# Performance - Members
GET /orgs/{orgId}/performance/members/{userId}/scorecard        → Personal KPIs
GET /orgs/{orgId}/performance/members/{userId}/trends           → Throughput + cycle time trends
GET /orgs/{orgId}/performance/members/{userId}/patterns         → Activity heatmap + work distribution

# Performance - Comparisons
GET /orgs/{orgId}/performance/compare?type=project&ids=a,b      → Side-by-side metrics
GET /orgs/{orgId}/performance/compare?type=period&from=...&to=...

# Performance - Reports
GET  /orgs/{orgId}/performance/reports                          → List available reports
POST /orgs/{orgId}/performance/reports/generate                 → Generate report (async → Asynq)
GET  /orgs/{orgId}/performance/reports/{reportId}/download      → Download generated report

# Analytics Events (admin)
GET /orgs/{orgId}/analytics/events?entity_type=task&entity_id=X → Raw event stream
```

---

## 8. Database Schema Additions

### 8.1 Summary of New Tables

| Table                    | Purpose                                       | Estimated Size (1 year, medium org) |
| ------------------------ | --------------------------------------------- | ----------------------------------- |
| `analytics_events`       | Raw event stream for all trackable activities | ~5M rows (partitioned monthly)      |
| `daily_metrics`          | Pre-computed daily KPIs per scope             | ~50K rows                           |
| `weekly_metrics`         | Pre-computed weekly KPIs per scope            | ~10K rows                           |
| `monthly_metrics`        | Pre-computed monthly KPIs per scope           | ~2K rows                            |
| `task_status_snapshots`  | Daily CFD data per project                    | ~10K rows                           |
| `task_state_transitions` | Every status change with timestamp            | ~500K rows                          |
| `risk_scores`            | Latest risk assessment per task               | ~50K rows                           |
| `performance_reports`    | Generated report metadata + S3 path           | ~500 rows                           |
| `metric_alerts`          | Triggered anomaly alerts                      | ~5K rows                            |
| `user_activity_sessions` | Aggregated session data                       | ~100K rows                          |

### 8.2 Additional Schema

```sql
-- Per-task risk scores (updated by background job)
CREATE TABLE risk_scores (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    risk_level  TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    risk_score  DECIMAL(5,2) NOT NULL,  -- 0.00 to 100.00
    factors     JSONB NOT NULL,         -- {deadline_risk: 0.8, workload_risk: 0.5, ...}
    predicted_completion TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, task_id)
);

-- Anomaly alerts
CREATE TABLE metric_alerts (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    alert_type  TEXT NOT NULL,          -- 'velocity_drop', 'burnout_risk', 'scope_creep', etc.
    severity    TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    scope_type  TEXT NOT NULL,          -- 'org', 'project', 'team', 'user', 'task'
    scope_id    UUID NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    data        JSONB,                  -- supporting data
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metric_alerts_active
    ON metric_alerts (org_id, severity, created_at DESC)
    WHERE acknowledged_at IS NULL;

-- Generated reports stored in MinIO
CREATE TABLE performance_reports (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    report_type     TEXT NOT NULL,      -- 'weekly_status', 'sprint_retro', 'project_health', etc.
    scope_type      TEXT NOT NULL,
    scope_id        UUID NOT NULL,
    parameters      JSONB NOT NULL,     -- date range, filters, etc.
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    storage_path    TEXT,               -- MinIO object key
    generated_by    UUID NOT NULL,
    generated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 9. Implementation Roadmap

### Phase 1: Foundation (2 weeks) — Activity Logging & Data Collection

**Backend:**

1. Create `analytics_events` table + migration
2. Create `task_state_transitions` table + migration
3. Create `task_status_snapshots` table + migration
4. Enhance event publisher to emit detailed events (status transitions with timestamps)
5. Create Asynq worker: `analytics:log_event` — writes to analytics_events
6. Create Asynq scheduler: daily snapshot job for CFD data
7. Backfill task_state_transitions from existing activity_log

**Frontend:**

- No UI changes yet (data collection phase)

---

### Phase 2: Core Metrics Engine (2 weeks) — KPI Computation

**Backend:**

1. Create `daily_metrics` / `weekly_metrics` / `monthly_metrics` tables + migrations
2. Implement metric calculator service:
   - Throughput per scope per day
   - Cycle time (from task_state_transitions)
   - Lead time (from tasks.created_at → done transition)
   - On-time delivery rate
   - Estimation accuracy
   - WIP count
3. Create Asynq scheduler: daily rollup job
4. Create Redis cache layer for computed metrics
5. Implement API endpoints:
   - `GET /performance/overview`
   - `GET /performance/projects/{id}/flow`

---

### Phase 3: Enhanced Dashboard (2 weeks) — Visual Overhaul

**Frontend:**

1. Install charting library (Recharts or Tremor — DaisyUI-compatible)
2. Build dashboard widgets:
   - Health Score Ring
   - Velocity Trend Chart
   - Cumulative Flow Diagram
   - Warnings & Issues Panel
   - At-Risk Tasks Table
   - Workload Balance Chart
3. Connect to enhanced dashboard API endpoints
4. Real-time WebSocket updates for live counters

**Backend:**

1. Enhanced `GET /dashboard/stats` with health score, more KPIs
2. `GET /dashboard/warnings` endpoint (rule-based alerts)
3. `GET /dashboard/velocity` endpoint
4. `GET /dashboard/cfd` endpoint

---

### Phase 4: Predictions & Risk (2 weeks) — Intelligence Layer

**Backend:**

1. Create `risk_scores` + `metric_alerts` tables + migrations
2. Implement Monte Carlo delivery prediction (Go implementation)
3. Implement rule-based risk scoring (weighted composite)
4. Implement anomaly detection (Z-score, CUSUM for velocity drops)
5. Implement burnout risk calculation
6. Create Asynq scheduler: daily predictions job
7. API endpoints:
   - `GET /dashboard/predictions`
   - `GET /performance/projects/{id}/risks`
   - `GET /performance/projects/{id}/schedule` (with forecast)

**Frontend:**

1. Prediction Panel widget
2. Risk score badges on tasks
3. Burnout risk indicators on member workload views

---

### Phase 5: Performance Panel (3 weeks) — Deep Analytics UI

**Frontend:**

1. Add "Performance" section to sidebar navigation
2. Build Performance > Organization page
3. Build Performance > Projects deep dive (7 sections)
4. Build Performance > Teams deep dive (5 sections)
5. Build Performance > Members profile (6 sections — privacy-filtered)
6. Build Performance > Comparisons page
7. Interactive dependency graph visualization (D3.js or react-flow)

**Backend:**

1. All remaining performance API endpoints
2. Comparison endpoints
3. Dependency graph API (with CPM, PageRank results)

---

### Phase 6: Reports & Advanced (2 weeks)

**Backend:**

1. Create `performance_reports` table + migration
2. Report generation Asynq workers (PDF via Go templating or headless Chrome)
3. Report scheduling (weekly auto-send via email)
4. CSV/JSON export endpoints

**Frontend:**

1. Performance > Reports page
2. Report configuration UI (date range, scope, format)
3. Download/email report actions

---

### Phase 7: ML & AI Intelligence (ongoing, v0.3.0+)

1. Train task risk classifier (Random Forest / XGBoost) on historical data
2. Estimation auto-suggest (kNN from similar past tasks)
3. Sentiment analysis on comments for team morale
4. Smart task search (embedding-based semantic search via Meilisearch)
5. Auto-generated weekly summaries (LLM integration via MCP Server)
6. Optimal task assignment suggestions (Hungarian Algorithm)
7. Sprint planning optimization (Genetic Algorithm)

---

## Appendix A: Algorithm Implementation Priority

### Must-Have (Phase 1–4):

| Algorithm                        | KPIs It Powers           | Go Complexity                        |
| -------------------------------- | ------------------------ | ------------------------------------ |
| EMA (Exponential Moving Average) | Velocity trends          | Trivial (10 lines)                   |
| Linear Regression                | Burndown forecast        | Easy (30 lines)                      |
| Monte Carlo Simulation           | Delivery confidence      | Medium (100 lines)                   |
| Z-Score                          | Anomaly detection        | Trivial (5 lines)                    |
| CUSUM                            | Trend shift detection    | Easy (20 lines)                      |
| Weighted Composite Score         | Health, Risk scores      | Easy (30 lines)                      |
| Gini Coefficient                 | Workload balance         | Easy (15 lines)                      |
| Topological Sort                 | Task dependency ordering | Easy (existing in Go stdlib pattern) |
| Critical Path Method             | Schedule analysis        | Medium (50 lines)                    |
| Control Charts                   | Cycle time monitoring    | Easy (20 lines)                      |

### Nice-to-Have (Phase 5–6):

| Algorithm               | Use Case                      |
| ----------------------- | ----------------------------- |
| Kaplan-Meier (Survival) | Task aging probability        |
| PageRank                | Important task identification |
| Betweenness Centrality  | Bottleneck detection          |
| Isolation Forest        | Multi-dim anomaly detection   |
| Cosine Similarity       | Duplicate task detection      |
| RAKE/TextRank           | Auto-labeling                 |

### Future (Phase 7 — ML/AI):

| Algorithm               | Use Case              |
| ----------------------- | --------------------- |
| Random Forest / XGBoost | Risk classification   |
| kNN                     | Estimation suggestion |
| Sentiment Analysis      | Team morale           |
| LDA                     | Topic discovery       |
| Embedding Search        | Semantic task search  |
| Hungarian Algorithm     | Optimal assignment    |
| Genetic Algorithm       | Sprint planning       |

---

## Appendix B: Chart Library Recommendation

| Library                        | Pros                                                     | Cons                          | Verdict                              |
| ------------------------------ | -------------------------------------------------------- | ----------------------------- | ------------------------------------ |
| **Recharts**                   | React-native, declarative, huge community, composable    | Bundle size ~200KB            | **Recommended for most widgets**     |
| **Tremor**                     | Built for dashboards, Tailwind-native, gorgeous defaults | Less customizable, newer      | Good for KPI cards                   |
| **D3.js**                      | Maximum flexibility, any visualization possible          | Steep learning curve, manual  | Use ONLY for dependency graph        |
| **react-flow**                 | Best for node-based DAG visualization                    | Overkill for simple charts    | Use for dependency visualization     |
| **Nivo**                       | Beautiful defaults, animation, good responsiveness       | Less composable than Recharts | Alternative to Recharts              |
| **Chart.js (react-chartjs-2)** | Lightweight, canvas-based, fast rendering                | Less React-idiomatic          | Good for performance-critical charts |

**Recommendation**: Recharts (primary) + react-flow (dependency DAG) + D3 (exotic visualizations only)

---

## Appendix C: Privacy & RBAC for Analytics

```
Analytics Permission Matrix:

                        Org Owner  Admin   Member   Viewer
Org Performance            ✅       ✅      ❌       ❌
Project Performance        ✅       ✅      Own ✅   Own ✅
Team Performance           ✅       ✅      Own ✅   ❌
Own Member Profile         ✅       ✅      ✅       ✅
Other Member Profile       ✅       ✅      ❌       ❌
Comparisons                ✅       ✅      ❌       ❌
Reports (generate)         ✅       ✅      ❌       ❌
Reports (view own team)    ✅       ✅      ✅       ❌
Anomaly Alerts             ✅       ✅      ❌       ❌

New permissions to seed:
- performance:read:org
- performance:read:project
- performance:read:team
- performance:read:member_self
- performance:read:member_any
- performance:compare:org
- reports:generate:org
- reports:read:org
- alerts:read:org
- alerts:acknowledge:org
```

---

## Appendix D: Key Differentiators vs Competition

| Feature                      | Jira   | Linear | Asana | ClickUp | **OrbisPM**                      |
| ---------------------------- | ------ | ------ | ----- | ------- | -------------------------------- |
| Flow metrics (cycle/lead)    | Plugin | ❌     | ❌    | Basic   | **Native with control charts**   |
| Monte Carlo predictions      | ❌     | ❌     | ❌    | ❌      | **Built-in delivery confidence** |
| Burnout risk detection       | ❌     | ❌     | ❌    | ❌      | **AI-powered early warning**     |
| Dependency critical path     | Plugin | ❌     | ❌    | Basic   | **Visual DAG + CPM**             |
| Estimation accuracy analysis | Plugin | ❌     | ❌    | ❌      | **Per-user accuracy profiles**   |
| Auto-generated reports       | ❌     | ❌     | Basic | Basic   | **AI summary + PDF export**      |
| Real-time anomaly alerts     | ❌     | ❌     | ❌    | ❌      | **Rule + ML anomaly engine**     |
| Privacy-aware analytics      | N/A    | N/A    | N/A   | N/A     | **RBAC-filtered per role**       |
| Workload Gini coefficient    | ❌     | ❌     | ❌    | ❌      | **Mathematical balance scoring** |
| Health score composite       | ❌     | ❌     | ❌    | ❌      | **Single 0-100 project health**  |

---

_This document serves as the comprehensive research foundation. Implementation follows the phased roadmap in Section 9. Each phase should be treated as an independent deliverable with its own testing and validation._
