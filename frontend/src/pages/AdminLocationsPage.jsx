import { useEffect, useMemo, useState } from "react";
import { Armchair, Building2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import Alert from "../components/Alert.jsx";
import EmptyState from "../components/EmptyState.jsx";
import FormField from "../components/FormField.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SpaceTypeBadge from "../components/SpaceTypeBadge.jsx";
import { createOffice, deleteOffice, getOffices, updateOffice } from "../services/offices.js";
import { createSpace, deleteSpace, getSpaces, updateSpace } from "../services/spaces.js";

const EMPTY_FORM = {
  mode: "OFFICE",
  editingId: null,
  name: "",
  city: "",
  timezone: "",
  type: "DESK",
  capacity: 1,
  officeId: "",
};

/**
 * Offices and their spaces are managed together: an office section lists the
 * desks and rooms inside it, and the single form at the top switches between
 * adding an office or adding a space.
 */
export default function AdminLocationsPage() {
  const [offices, setOffices] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [filters, setFilters] = useState({ officeId: "", type: "", term: "" });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getOffices(), getSpaces({ includeInactive: "true" })])
      .then(([officeItems, spaceItems]) => {
        if (!active) return;
        setOffices(officeItems);
        setSpaces(spaceItems);
        setForm((current) => (current.officeId ? current : { ...current, officeId: officeItems[0]?.id ?? "" }));
      })
      .catch((err) => {
        if (active) setMessage({ type: "error", text: err.message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const grouped = useMemo(() => {
    const term = filters.term.trim().toLowerCase();
    return offices
      .filter((office) => !filters.officeId || office.id === filters.officeId)
      .map((office) => ({
        office,
        spaces: spaces.filter(
          (space) =>
            space.officeId === office.id &&
            (!filters.type || space.type === filters.type) &&
            (!term || space.name.toLowerCase().includes(term)),
        ),
      }))
      .filter((entry) => !(filters.type || term) || entry.spaces.length > 0);
  }, [offices, spaces, filters]);

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openCreate(mode) {
    setForm({ ...EMPTY_FORM, mode, officeId: offices[0]?.id ?? "" });
    setShowForm(true);
  }

  function openEditOffice(office) {
    setForm({
      ...EMPTY_FORM,
      mode: "OFFICE",
      editingId: office.id,
      name: office.name,
      city: office.city,
      timezone: office.timezone,
      officeId: office.id,
    });
    setShowForm(true);
  }

  function openEditSpace(space) {
    setForm({
      ...EMPTY_FORM,
      mode: "SPACE",
      editingId: space.id,
      name: space.name,
      type: space.type,
      capacity: space.capacity,
      officeId: space.office?.id ?? space.officeId,
    });
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (form.mode === "OFFICE") {
        const payload = { name: form.name, city: form.city, timezone: form.timezone };
        if (form.editingId) await updateOffice(form.editingId, payload);
        else await createOffice(payload);
        setMessage({ type: "success", text: form.editingId ? "Office updated." : "Office added." });
      } else {
        const payload = {
          name: form.name,
          type: form.type,
          capacity: Number(form.capacity),
          officeId: form.officeId,
        };
        if (form.editingId) await updateSpace(form.editingId, payload);
        else await createSpace(payload);
        setMessage({ type: "success", text: form.editingId ? "Space updated." : "Space added." });
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setReloadToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOffice(office) {
    if (!window.confirm(`Delete ${office.name}? Offices with spaces cannot be deleted.`)) return;
    setMessage(null);
    try {
      await deleteOffice(office.id);
      setMessage({ type: "success", text: "Office deleted." });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function handleDeleteSpace(space) {
    if (!window.confirm(`Delete ${space.name}? Spaces with bookings cannot be deleted.`)) return;
    setMessage(null);
    try {
      await deleteSpace(space.id);
      setMessage({ type: "success", text: "Space deleted." });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function handleToggleActive(space) {
    setMessage(null);
    try {
      await updateSpace(space.id, { isActive: !space.isActive });
      setMessage({ type: "success", text: space.isActive ? "Space deactivated." : "Space activated." });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  const isOffice = form.mode === "OFFICE";

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Administration"
        title="Offices & spaces"
        subtitle="Set up each office, then add the desks and meeting rooms inside it."
        actions={
          <div className="chip-row" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn--secondary" onClick={() => openCreate("OFFICE")}>
              <Building2 size={18} aria-hidden="true" /> Add office
            </button>
            <button type="button" className="btn btn--primary" onClick={() => openCreate("SPACE")}>
              <Plus size={18} aria-hidden="true" /> Add space
            </button>
          </div>
        }
      />

      {message && <Alert type={message.type}>{message.text}</Alert>}

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="card__head">
            <h2>
              {form.editingId ? "Edit " : "New "}
              {isOffice ? "office" : "space"}
            </h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>

          <div className="form-row">
            <FormField
              label="Name"
              value={form.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={isOffice ? "Islamabad HQ" : "Desk 4-12"}
              required
            />

            {isOffice ? (
              <>
                <FormField
                  label="City"
                  value={form.city}
                  onChange={(event) => update({ city: event.target.value })}
                  placeholder="Islamabad"
                  required
                />
                <FormField
                  label="Time zone"
                  value={form.timezone}
                  onChange={(event) => update({ timezone: event.target.value })}
                  placeholder="Asia/Karachi"
                  hint="IANA name, e.g. Asia/Karachi or Europe/Copenhagen."
                  required
                />
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="location-space-type">Type</label>
                  <select
                    id="location-space-type"
                    value={form.type}
                    onChange={(event) => update({ type: event.target.value })}
                  >
                    <option value="DESK">Desk</option>
                    <option value="ROOM">Meeting room</option>
                  </select>
                </div>
                <FormField
                  label="Capacity"
                  type="number"
                  min="1"
                  max="500"
                  value={form.capacity}
                  onChange={(event) => update({ capacity: event.target.value })}
                  required
                />
                <div className="field">
                  <label htmlFor="location-space-office">Office</label>
                  <select
                    id="location-space-office"
                    value={form.officeId}
                    onChange={(event) => update({ officeId: event.target.value })}
                    required
                  >
                    <option value="">Select an office</option>
                    {offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "Saving…" : `Save ${isOffice ? "office" : "space"}`}
          </button>
        </form>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="field field--inline" style={{ flex: "1 1 200px" }}>
            <label htmlFor="location-filter-office">Office</label>
            <select
              id="location-filter-office"
              value={filters.officeId}
              onChange={(event) => setFilters({ ...filters, officeId: event.target.value })}
            >
              <option value="">All offices</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field field--inline" style={{ flex: "1 1 160px" }}>
            <label htmlFor="location-filter-type">Space type</label>
            <select
              id="location-filter-type"
              value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value })}
            >
              <option value="">Any</option>
              <option value="DESK">Desk</option>
              <option value="ROOM">Meeting room</option>
            </select>
          </div>
          <div className="field field--inline" style={{ flex: "1 1 200px" }}>
            <label htmlFor="location-filter-term">Space name</label>
            <input
              id="location-filter-term"
              type="search"
              placeholder="Search desks and rooms"
              value={filters.term}
              onChange={(event) => setFilters({ ...filters, term: event.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setFilters({ officeId: "", type: "", term: "" })}
          >
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading offices and spaces…</p>
      ) : offices.length === 0 ? (
        <EmptyState icon={Building2} title="No offices yet">
          Add your first office, then give it some desks and meeting rooms.
        </EmptyState>
      ) : grouped.length === 0 ? (
        <EmptyState icon={Armchair} title="Nothing matches these filters">
          Widen the filters or clear the search box.
        </EmptyState>
      ) : (
        grouped.map(({ office, spaces: officeSpaces }) => (
          <section key={office.id} className="card">
            <div className="card__head">
              <div>
                <h2>{office.name}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {office.city} · {office.timezone} · {officeSpaces.length} space
                  {officeSpaces.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEditOffice(office)}>
                  <Pencil size={14} aria-hidden="true" /> Edit office
                </button>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => handleDeleteOffice(office)}>
                  <Trash2 size={14} aria-hidden="true" /> Delete
                </button>
              </div>
            </div>

            {officeSpaces.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No spaces here yet — use “Add space” above to create the first one.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Space</th>
                      <th>Type</th>
                      <th className="is-right">Capacity</th>
                      <th>Status</th>
                      <th className="is-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officeSpaces.map((space) => (
                      <tr key={space.id}>
                        <td className="cell-strong">{space.name}</td>
                        <td>
                          <SpaceTypeBadge type={space.type} />
                        </td>
                        <td className="is-right">{space.capacity}</td>
                        <td>
                          <span className={space.isActive ? "badge badge--active" : "badge badge--muted"}>
                            {space.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="is-right">
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => openEditSpace(space)}
                            >
                              <Pencil size={14} aria-hidden="true" /> Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => handleToggleActive(space)}
                            >
                              <Power size={14} aria-hidden="true" /> {space.isActive ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => handleDeleteSpace(space)}
                            >
                              <Trash2 size={14} aria-hidden="true" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
