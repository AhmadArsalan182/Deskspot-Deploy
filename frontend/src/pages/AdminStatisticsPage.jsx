import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarX, ChartColumn, Gauge, Percent } from "lucide-react";
import Alert from "../components/Alert.jsx";
import { BarChart, LineChart } from "../components/Charts.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { getStatistics } from "../services/admin.js";
import { formatDayKey } from "../utils/date.js";

const WINDOWS = [7, 14, 30];
const TABLE_ROWS = 7;
const OFFICE_COLORS = ["#1f6b45", "#3f7a5c", "#b45309", "#0f766e", "#4b6b58", "#b91c1c"];

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="stat stat--icon">
      {Icon && (
        <span className="stat__icon" aria-hidden="true">
          <Icon size={16} />
        </span>
      )}
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export default function AdminStatisticsPage() {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState(null);
  const [loadedDays, setLoadedDays] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;
    getStatistics({ days })
      .then((data) => {
        if (active) {
          setReport(data);
          setLoadedDays(days);
        }
      })
      .catch((err) => {
        if (active) {
          setMessage({ type: "error", text: err.message });
          setLoadedDays(days);
        }
      });
    return () => {
      active = false;
    };
  }, [days]);

  // Derived rather than stored, so a window change is "loading" until its own
  // response lands and no state is written from inside the effect body.
  const loading = loadedDays !== days;
  const offices = useMemo(() => report?.offices ?? [], [report]);

  // One pass over the offices produces every headline number on the page.
  const summary = useMemo(() => {
    const totals = offices.reduce(
      (acc, entry) => ({
        bookings: acc.bookings + entry.bookings,
        cancelled: acc.cancelled + entry.cancelledBookings,
        bookedSlots: acc.bookedSlots + entry.bookedSlots,
        capacitySlots: acc.capacitySlots + entry.capacitySlots,
        activeSpaces: acc.activeSpaces + entry.activeSpaces,
      }),
      { bookings: 0, cancelled: 0, bookedSlots: 0, capacitySlots: 0, activeSpaces: 0 },
    );
    return {
      ...totals,
      occupancyPercent:
        totals.capacitySlots > 0
          ? Math.round((totals.bookedSlots / totals.capacitySlots) * 1000) / 10
          : 0,
    };
  }, [offices]);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Administration"
        title="Usage statistics"
        subtitle="Occupancy and demand per office for the next few weeks, based on confirmed bookings."
        actions={
          <div className="chip-row" style={{ marginTop: 0 }}>
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                className={days === window ? "chip chip--active" : "chip"}
                onClick={() => {
                  setMessage(null);
                  setDays(window);
                }}
              >
                Next {window} days
              </button>
            ))}
          </div>
        }
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      {!report ? (
        loading ? <p className="muted">Crunching numbers…</p> : null
      ) : offices.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing to report yet">
          Add offices and spaces, then bookings will start showing up here.
        </EmptyState>
      ) : (
        <>
          <div className="metrics-panel">
            <Metric
              icon={Gauge}
              label={`Occupancy · ${report.days}d`}
              value={`${summary.occupancyPercent}%`}
              hint={`${summary.bookedSlots} of ${summary.capacitySlots} slots`}
            />
            <Metric
              icon={ChartColumn}
              label="Bookings"
              value={summary.bookings}
              hint={`across ${offices.length} office${offices.length === 1 ? "" : "s"}`}
            />
            <Metric
              icon={CalendarX}
              label="Cancellations"
              value={summary.cancelled}
              hint={
                summary.bookings + summary.cancelled > 0
                  ? `${Math.round((summary.cancelled / (summary.bookings + summary.cancelled)) * 100)}% of all requests`
                  : "no requests yet"
              }
            />
            <Metric
              icon={Percent}
              label="Active spaces"
              value={summary.activeSpaces}
              hint={`${Math.round(summary.activeSpaces / offices.length)} per office on average`}
            />
          </div>

          <section className="card">
            <div className="card__head">
              <div>
                <h2>Occupancy by office</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Share of bookable slots filled over the next {report.days} days.
                </p>
              </div>
            </div>
            <BarChart
              ariaLabel="Occupancy percentage by office"
              formatValue={(value) => `${value}%`}
              showValues
              data={offices.map((entry, index) => ({
                label: entry.office.name,
                value: entry.occupancyPercent,
                color: OFFICE_COLORS[index % OFFICE_COLORS.length],
              }))}
            />
          </section>

          <div className="grid grid--2">
            {offices.map((entry, index) => {
              const peak = entry.perDay.reduce(
                (best, row) => (row.bookedSlots > best.bookedSlots ? row : best),
                entry.perDay[0] ?? { bookedSlots: 0, date: "" },
              );
              const recent = entry.perDay.slice(0, TABLE_ROWS);

              return (
                <section key={entry.office.id} className="card">
                  <div className="card__head">
                    <div>
                      <h2>{entry.office.name}</h2>
                      <p className="muted" style={{ margin: 0 }}>
                        {entry.office.city} · {entry.activeSpaces} active spaces
                      </p>
                    </div>
                    <div className="stat__value" style={{ fontSize: "1.6rem" }}>
                      {entry.occupancyPercent}%
                    </div>
                  </div>

                  <div className="meter" aria-hidden="true">
                    <div
                      className="meter__fill"
                      style={{
                        width: `${Math.min(100, entry.occupancyPercent)}%`,
                        background: OFFICE_COLORS[index % OFFICE_COLORS.length],
                      }}
                    />
                  </div>

                  <div className="grid grid--3" style={{ marginTop: 16 }}>
                    <div className="stat">
                      <div className="stat__label">Bookings</div>
                      <div className="stat__value" style={{ fontSize: "1.35rem" }}>{entry.bookings}</div>
                      <div className="stat__hint">{entry.cancelledBookings} cancelled</div>
                    </div>
                    <div className="stat">
                      <div className="stat__label">Booked slots</div>
                      <div className="stat__value" style={{ fontSize: "1.35rem" }}>{entry.bookedSlots}</div>
                      <div className="stat__hint">of {entry.capacitySlots}</div>
                    </div>
                    <div className="stat">
                      <div className="stat__label">Peak day</div>
                      <div className="stat__value" style={{ fontSize: "1.05rem" }}>
                        {peak.date ? formatDayKey(peak.date) : "-"}
                      </div>
                      <div className="stat__hint">{peak.bookedSlots} slots booked</div>
                    </div>
                  </div>

                  <div className="section-title" style={{ marginTop: 20 }}>Daily booked slots</div>
                  <LineChart
                    ariaLabel={`Daily booked slots for ${entry.office.name}`}
                    color={OFFICE_COLORS[index % OFFICE_COLORS.length]}
                    height={150}
                    data={entry.perDay.map((row) => ({
                      label: formatDayKey(row.date).replace(/^\w+ /, ""),
                      value: row.bookedSlots,
                    }))}
                  />

                  <details className="details">
                    <summary>First {Math.min(TABLE_ROWS, entry.perDay.length)} days in numbers</summary>
                    <div className="table-wrap" style={{ marginTop: 12 }}>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th className="is-right">Bookings</th>
                            <th className="is-right">Slots</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((row) => (
                            <tr key={row.date}>
                              <td>{formatDayKey(row.date)}</td>
                              <td className="is-right">{row.bookings}</td>
                              <td className="is-right">{row.bookedSlots}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
