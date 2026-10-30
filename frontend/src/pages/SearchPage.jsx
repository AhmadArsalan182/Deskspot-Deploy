import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CircleSlash, Clock, Repeat, Search, Users } from "lucide-react";
import Alert from "../components/Alert.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { createBooking, createRecurringBooking } from "../services/bookings.js";
import { openAvailabilityStream, searchAvailability } from "../services/availability.js";
import { getOffices } from "../services/offices.js";
import {
  END_TIMES,
  START_TIMES,
  addDays,
  durationLabel,
  earliestStartMinutes,
  formatDayKey,
  nowInZone,
  timeToMinutes,
  todayKey,
} from "../utils/date.js";

const INITIAL_FILTERS = {
  officeId: "",
  date: todayKey(),
  from: "09:00",
  to: "10:00",
  type: "",
  attendees: 1,
};

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export default function SearchPage() {
  const [offices, setOffices] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [result, setResult] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchToken, setSearchToken] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [repeatEnd, setRepeatEnd] = useState(() => addDays(todayKey(), 14));
  const [pendingSeries, setPendingSeries] = useState(null);

  const { officeId, date, from, to, type, attendees } = filters;

  const office = offices.find((candidate) => candidate.id === officeId);
  const timeZone = office?.timezone;

  // "Now" is judged in the office's own time zone, so the slots a visitor can
  // pick always match the wall clock on that office's floor.
  const officeToday = timeZone ? nowInZone(timeZone).dayKey : todayKey();
  const minStartMinutes = earliestStartMinutes(date, timeZone);

  const startOptions = START_TIMES.filter((time) => timeToMinutes(time) >= minStartMinutes);
  const endOptions = END_TIMES.filter((time) => timeToMinutes(time) > minStartMinutes);
  const noSlotsLeft = Boolean(officeId) && startOptions.length === 0 && date === officeToday;

  // The window that is actually searched. When the stored start has already
  // passed today it rolls forward to the next free slot, which is derived during
  // render rather than written back into state from an effect.
  const rolled = timeToMinutes(from) < minStartMinutes;
  const windowFrom = rolled ? (startOptions[0] ?? from) : from;
  const windowTo = rolled
    ? (END_TIMES.find((time) => timeToMinutes(time) > timeToMinutes(windowFrom)) ?? to)
    : to;
  const rangeInvalid = windowTo <= windowFrom;

  // A stale result must not stay on screen once the office's day is over.
  const visibleResult = noSlotsLeft ? null : result;

  useEffect(() => {
    let active = true;
    getOffices()
      .then((items) => {
        if (!active) return;
        setOffices(items);
        setFilters((current) =>
          current.officeId ? current : { ...current, officeId: items[0]?.id ?? "" },
        );
      })
      .catch((err) => {
        if (active) setMessage({ type: "error", text: err.message });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!officeId || rangeInvalid || noSlotsLeft) return undefined;
    let active = true;
    searchAvailability({ officeId, date, from: windowFrom, to: windowTo, type })
      .then((data) => {
        if (active) {
          setResult(data);
          setMessage(null);
        }
      })
      .catch((err) => {
        if (active) {
          setResult(null);
          setMessage({ type: "error", text: err.message });
        }
      });
    return () => {
      active = false;
    };
  }, [officeId, date, windowFrom, windowTo, type, rangeInvalid, noSlotsLeft, searchToken]);

  useEffect(() => {
    if (!officeId || !date) return undefined;
    return openAvailabilityStream({
      officeId,
      date,
      onChange: () => setSearchToken((token) => token + 1),
    });
  }, [officeId, date]);

  function update(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleWeekday(value) {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((day) => day !== value) : [...current, value].sort(),
    );
  }

  async function handleBook(space) {
    if (repeat) {
      if (weekdays.length === 0) {
        setMessage({ type: "error", text: "Pick at least one weekday for the recurring series." });
        return;
      }
      setPendingSeries(space);
      return;
    }

    setBookingId(space.id);
    setMessage(null);
    try {
      const booking = await createBooking({
        spaceId: space.id,
        date,
        from: windowFrom,
        to: windowTo,
        attendees: Number(attendees),
      });
      setMessage({
        type: "success",
        text: `Booked ${space.name} for ${formatDayKey(booking.date)} at ${booking.localStartTime}.`,
      });
      setSearchToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBookingId(null);
    }
  }

  async function confirmSeries() {
    const space = pendingSeries;
    if (!space) return;
    setPendingSeries(null);
    setBookingId(space.id);
    setMessage(null);
    try {
      const series = await createRecurringBooking({
        spaceId: space.id,
        startDate: date,
        endDate: repeatEnd,
        from: windowFrom,
        to: windowTo,
        attendees: Number(attendees),
        weekdays,
      });
      const failures = series.results.filter((row) => !row.ok);
      setMessage({
        type: failures.length ? "warning" : "success",
        text:
          failures.length === 0
            ? `Booked ${space.name} on ${series.created} day${series.created === 1 ? "" : "s"}.`
            : `Created ${series.created} of ${series.requested} bookings. ${failures.length} day${failures.length === 1 ? "" : "s"} failed (e.g. ${failures[0].error?.message ?? "conflict"}).`,
      });
      setSearchToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBookingId(null);
    }
  }

  const spaces = visibleResult?.spaces ?? [];
  const available = spaces.filter((space) => space.available);
  const loading =
    Boolean(officeId) && !rangeInvalid && !noSlotsLeft && !visibleResult && !message;

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Find a space"
        title="Book a desk or meeting room"
        subtitle="Pick an office, a date and a time window. Only free spaces can be booked."
      />

      {rangeInvalid && <Alert type="error">The end time must be after the start time.</Alert>}
      {message && <Alert type={message.type}>{message.text}</Alert>}

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchToken((token) => token + 1);
        }}
      >
        <div className="toolbar">
          <div className="field field--inline" style={{ flex: "1 1 220px" }}>
            <label htmlFor="office">Office</label>
            <select
              id="office"
              value={officeId}
              onChange={(event) => update({ officeId: event.target.value })}
              required
            >
              <option value="">Select an office</option>
              {offices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.city})
                </option>
              ))}
            </select>
          </div>

          <div className="field field--inline" style={{ flex: "1 1 170px" }}>
            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              min={officeToday}
              max={addDays(officeToday, 14)}
              value={date}
              onChange={(event) => update({ date: event.target.value })}
              required
            />
          </div>

          <div className="field field--inline" style={{ flex: "1 1 130px" }}>
            <label htmlFor="from">From</label>
            <select
              id="from"
              value={windowFrom}
              onChange={(event) => update({ from: event.target.value })}
              disabled={noSlotsLeft}
            >
              {startOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          <div className="field field--inline" style={{ flex: "1 1 130px" }}>
            <label htmlFor="to">To</label>
            <select
              id="to"
              value={windowTo}
              onChange={(event) => update({ to: event.target.value })}
              disabled={noSlotsLeft}
            >
              {endOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          <div className="field field--inline" style={{ flex: "0 1 150px" }}>
            <label htmlFor="type">Type</label>
            <select id="type" value={type} onChange={(event) => update({ type: event.target.value })}>
              <option value="">Any</option>
              <option value="DESK">Desk</option>
              <option value="ROOM">Meeting room</option>
            </select>
          </div>

          <div className="field field--inline" style={{ flex: "0 1 120px" }}>
            <label htmlFor="attendees">People</label>
            <input
              id="attendees"
              type="number"
              min="1"
              max="500"
              value={attendees}
              onChange={(event) => update({ attendees: event.target.value })}
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary"
            disabled={!officeId || rangeInvalid || noSlotsLeft}
          >
            <Search size={18} aria-hidden="true" /> Refresh
          </button>
        </div>

        <div className="toolbar" style={{ marginTop: 12 }}>
          <label className="chip" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={repeat}
              onChange={(event) => setRepeat(event.target.checked)}
              style={{ marginRight: 8 }}
            />
            <Repeat size={14} aria-hidden="true" /> Repeat this booking
          </label>
          {repeat && (
            <>
              <div className="chip-row" style={{ marginTop: 0 }} role="group" aria-label="Weekdays">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={weekdays.includes(day.value) ? "chip chip--active" : "chip"}
                    onClick={() => toggleWeekday(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <div className="field field--inline" style={{ flex: "0 1 180px" }}>
                <label htmlFor="repeat-end">Until</label>
                <input
                  id="repeat-end"
                  type="date"
                  min={date}
                  max={addDays(officeToday, 14)}
                  value={repeatEnd}
                  onChange={(event) => setRepeatEnd(event.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {date === officeToday && !noSlotsLeft && (
          <p className="field__hint" style={{ marginTop: 12 }}>
            <Clock size={13} aria-hidden="true" /> It is {String(Math.floor(minStartMinutes / 60)).padStart(2, "0")}
            :{String(minStartMinutes % 60).padStart(2, "0")} or later in {office?.name ?? "this office"}. Times
            that have already passed today are hidden.
          </p>
        )}
        {noSlotsLeft && (
          <Alert type="warning">
            No bookable slots are left today in {office?.name ?? "this office"}; its opening hours have
            ended. Pick another date to continue.
          </Alert>
        )}
      </form>

      {visibleResult && (
        <>
          <div className="metrics-panel">
            <div className="stat">
              <div className="stat__label">Office</div>
              <div className="stat__value" style={{ fontSize: "1.15rem" }}>
                {visibleResult.office.name}
              </div>
              <div className="stat__hint">
                {visibleResult.office.city} · {visibleResult.office.timezone}
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">Window</div>
              <div className="stat__value" style={{ fontSize: "1.15rem" }}>
                {visibleResult.from}–{visibleResult.to}
              </div>
              <div className="stat__hint">
                {durationLabel(visibleResult.from, visibleResult.to)} on{" "}
                {formatDayKey(visibleResult.date)}
              </div>
            </div>
            <div className="stat">
              <div className="stat__label">Available</div>
              <div className="stat__value">{available.length}</div>
              <div className="stat__hint">of {spaces.length} spaces</div>
            </div>
          </div>

          {spaces.length === 0 ? (
            <EmptyState icon={CircleSlash} title="No spaces in this office">
              Try a different office or clear the type filter.
            </EmptyState>
          ) : (
            <div className="grid grid--3">
              {spaces.map((space) => (
                <article key={space.id} className="card space-card">
                  <div className="space-card__head">
                    <div>
                      <h3 className="space-card__title">{space.name}</h3>
                      <div className="space-card__meta">
                        <Users size={13} aria-hidden="true" /> Seats {space.capacity}
                      </div>
                    </div>
                    <SpaceTypeBadge type={space.type} />
                  </div>

                  <div>
                    {space.available ? (
                      <span className="badge badge--active">
                        <CalendarCheck size={13} aria-hidden="true" /> Free for this window
                      </span>
                    ) : (
                      <span className="badge badge--cancelled">
                        <CircleSlash size={13} aria-hidden="true" /> Unavailable
                      </span>
                    )}
                  </div>

                  {space.busy.length > 0 && (
                    <div>
                      <div className="section-title">Booked that day</div>
                      <div className="slots">
                        {space.busy.map((slot) => (
                          <span key={slot.startUtc} className="slot">
                            {slot.localStartTime}–{slot.localEndTime}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-card__foot">
                    <button
                      type="button"
                      className="btn btn--primary btn--block"
                      disabled={!space.available || bookingId === space.id}
                      onClick={() => handleBook(space)}
                    >
                      {bookingId === space.id
                        ? "Booking…"
                        : space.available
                          ? repeat
                            ? "Book series"
                            : "Book this space"
                          : "Not available"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {loading && <p className="muted">Checking availability…</p>}

      {!visibleResult && !loading && !message && !noSlotsLeft && (
        <EmptyState icon={Search} title="Choose an office to see what is free">
          Availability is shown in the office’s local time. Slots are 30 minutes, from 08:00 to 20:00.
        </EmptyState>
      )}

      <p className="muted">
        Looking for something you already booked? See <Link to="/bookings">my bookings</Link>.
      </p>

      <ConfirmDialog
        open={Boolean(pendingSeries)}
        title="Create recurring bookings"
        message={
          pendingSeries
            ? `Book ${pendingSeries.name} from ${windowFrom} to ${windowTo} on the selected weekdays until ${formatDayKey(repeatEnd)}? Each day is booked separately; conflicts on some dates will be reported without cancelling the others.`
            : ""
        }
        confirmLabel="Create series"
        cancelLabel="Cancel"
        onCancel={() => setPendingSeries(null)}
        onConfirm={confirmSeries}
      />
    </div>
  );
}
