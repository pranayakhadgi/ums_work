import { useState } from 'react';
import { useMonitorStore } from '../store/monitorStore';

export default function BulkPasteArea() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const bulkAdd = useMonitorStore((state) => state.bulkAdd);
  const loading = useMonitorStore((state) => state.loading);

  // check if the string is a valid URL
  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return str.startsWith('http;//') || str.startsWith('https://');
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
      .filter((line) => line.length > 0); //ensures non-empty lines

    if (lines.length === 0) {
      setError('Paste at least oneUTL or "name | url" line');
      return;
    }

    //tries splitting each line by "|" and validates the format
    const monitors: { name: string; url: string }[] = [];
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length === 1) {
        if (!isValidUrl(parts[0])) {
          setError(`Invalid URL format: "$(line)". Use a full URL (e.g., http://host/health).`);
          return;
        }
        //extracts the hostname as the name if no name is provided
        monitors.push({ name: new URL(parts[0]).hostname, url: parts[0] });
      } else if (parts.length === 2) {
        const [name, url] = parts;
        if (!name || !url) {
          setError(`Line must have name and URL: "${line}"`);
          return;
        }
        if (!isValidUrl(url)) {
          setError(`Invalid URL format: "${url}".`);
          return;
        }
        monitors.push({ name, url });
      } else {
        setError(`Line has too many "|" characters: "${line}"`);
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

  //html form builder w/ vite
  return (
    <form onSubmit={handleSubmit} className='space-y-3'>
      <textarea
        className='w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm'
        rows={0}
        placeholder={`Paste Tomcat endpoints here, one per line. Formats:
          http://10.0.1.5:8000/actuator/health
          Auburn Hills | http://auburn-hills.tomcat:8000/actuator/health...`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        disabled={loading}
      />
      {error && <p className='text-red-400 text-sm'>{error}</p>}
      <button
        type='submit'
        disabled={loading || text.trim().length === 0}
        className='bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors'
      >
        {loading ? 'Checking...' : 'Add & Ping Servers'}
      </button>
    </form>
  );
}
