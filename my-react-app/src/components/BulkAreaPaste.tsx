import { useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';

//make changes on the variable inference here
export default function BulkPasteArea() {
  const [text, setText]   = useState('');
  const [error, setError] = useState<string | null>(null);
  const bulkAdd = useMonitorStore((state) => state.bulkAdd);
  const loading = useMonitorStore((state) => state.loading);

  // check if the string is a valid URL
  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return str.startsWith('http://') || str.startsWith('https://');
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0); // ensures non-empty lines

    if (lines.length === 0) {
      setError('Paste at least one URL or "name | url" line.');
      return;
    }

    // tries splitting each line by "|" and validates the format
    const monitors: { name: string; url: string }[] = [];
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length === 1) {
        if (!isValidUrl(parts[0])) {
          setError(`Invalid URL: "${line}". Use a full URL (e.g. http://host/health).`);
          return;
        }
        // extracts the hostname as the name if no name is provided
        monitors.push({ name: new URL(parts[0]).hostname, url: parts[0] });
      } else if (parts.length === 2) {
        const [name, url] = parts;
        if (!name || !url) {
          setError(`Line must have name and URL: "${line}"`);
          return;
        }
        if (!isValidUrl(url)) {
          setError(`Invalid URL: "${url}".`);
          return;
        }
        monitors.push({ name, url });
      } else {
        setError(`Too many "|" characters in: "${line}"`);
        return;
      }
    }

    try {
      await bulkAdd(monitors);
      setText('');
    } catch (err) {
      setError('Failed to add monitors: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <form id="bulk-paste-form" onSubmit={handleSubmit} className="bulk-form">
      <textarea
        id="bulk-textarea"
        className="bulk-textarea"
        rows={4}
        placeholder={`One per line. Formats:\n  http://10.0.1.5:8080/actuator/health\n  Auburn Hills | http://auburn-hills.tomcat:8080/actuator/health`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        disabled={loading}
      />

      {error && <p className="msg-error">{error}</p>}

      <div>
        <button
          id="btn-bulk-add"
          type="submit"
          disabled={loading || text.trim().length === 0}
          className="btn btn-primary"
        >
          {loading ? 'Checking…' : 'Add & Ping Servers'}
        </button>
      </div>
    </form>
  );
}
