"use client";

import { Search } from "lucide-react";

interface Props {
  name: string;
  from: number;
  to: number;
  loading: boolean;
  onNameChange: (value: string) => void;
  onFromChange: (value: number) => void;
  onToChange: (value: number) => void;
  onSubmit: () => void;
}

export default function ScholarSearch(props: Props) {
  function submit(event: React.FormEvent) {
    event.preventDefault();
    props.onSubmit();
  }

  return (
    <form onSubmit={submit} className="search-panel" aria-label="Scholar search form" aria-busy={props.loading}>
      <div className="field field-name">
        <label htmlFor="scholar-name">Scholar name</label>
        <input
          id="scholar-name"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder="e.g. James Lester"
          autoComplete="name"
        />
      </div>
      <div className="year-pair">
        <div className="field">
          <label htmlFor="from-year">From</label>
          <input id="from-year" type="number" min="1900" max="2100" value={props.from}
            onChange={(event) => props.onFromChange(Number(event.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="to-year">To</label>
          <input id="to-year" type="number" min="1900" max="2100" value={props.to}
            onChange={(event) => props.onToChange(Number(event.target.value))} />
        </div>
      </div>
      <button className="primary-button search-button" type="submit" disabled={props.loading}>
        {props.loading ? <span className="spinner" aria-hidden="true" /> : <Search size={18} />}
        {props.loading ? "Searching DBLP…" : "Search scholar"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {props.loading ? "Searching DBLP..." : ""}
      </span>
    </form>
  );
}
