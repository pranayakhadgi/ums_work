import { useState } from 'react';
import { toast } from 'sonner';
import { useInstanceStore, type AddInstancePayload } from '../store/instanceStore';
import { X, Server, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
}

interface FormErrors {
  name?: string;
  managerUrl?: string;
  managerUser?: string;
  managerPass?: string;
}

export default function AddInstanceModal({ onClose }: Props) {
  const { addInstance } = useInstanceStore();

  const [form, setForm] = useState<AddInstancePayload>({
    name: '',
    managerUrl: '',
    managerUser: '',
    managerPass: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!form.managerUrl.trim()) {
      newErrors.managerUrl = 'Manager URL is required';
    } else {
      try {
        const parsed = new URL(form.managerUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          newErrors.managerUrl = 'URL must start with http:// or https://';
        }
      } catch {
        newErrors.managerUrl = 'Enter a valid URL (e.g. http://localhost:8080/manager)';
      }
    }

    if (!form.managerUser.trim()) {
      newErrors.managerUser = 'Username is required';
    }

    if (!form.managerPass.trim()) {
      newErrors.managerPass = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await addInstance(form);
      toast.success(`Instance "${form.name}" added successfully`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add instance';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof AddInstancePayload) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-instance-title"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <Server size={18} className="modal-icon" />
            <h2 id="add-instance-title" className="modal-title">Add Tomcat Instance</h2>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {/* Instance Name */}
            <div className="form-field">
              <label htmlFor="inst-name" className="form-label">
                Name <span className="form-required" aria-hidden="true">*</span>
              </label>
              <input
                id="inst-name"
                type="text"
                className={`form-input ${errors.name ? 'form-input--error' : ''}`}
                placeholder="e.g. Production Tomcat"
                value={form.name}
                onChange={handleChange('name')}
                autoComplete="off"
                autoFocus
              />
              {errors.name && (
                <p className="form-error" role="alert">{errors.name}</p>
              )}
            </div>

            {/* Manager URL */}
            <div className="form-field">
              <label htmlFor="inst-url" className="form-label">
                Manager URL <span className="form-required" aria-hidden="true">*</span>
              </label>
              <input
                id="inst-url"
                type="url"
                className={`form-input ${errors.managerUrl ? 'form-input--error' : ''}`}
                placeholder="http://localhost:8080/manager/text"
                value={form.managerUrl}
                onChange={handleChange('managerUrl')}
                autoComplete="off"
              />
              {errors.managerUrl && (
                <p className="form-error" role="alert">{errors.managerUrl}</p>
              )}
            </div>

            {/* Credentials row */}
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="inst-user" className="form-label">
                  Username <span className="form-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="inst-user"
                  type="text"
                  className={`form-input ${errors.managerUser ? 'form-input--error' : ''}`}
                  placeholder="tomcat"
                  value={form.managerUser}
                  onChange={handleChange('managerUser')}
                  autoComplete="username"
                />
                {errors.managerUser && (
                  <p className="form-error" role="alert">{errors.managerUser}</p>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="inst-pass" className="form-label">
                  Password <span className="form-required" aria-hidden="true">*</span>
                </label>
                <input
                  id="inst-pass"
                  type="password"
                  className={`form-input ${errors.managerPass ? 'form-input--error' : ''}`}
                  placeholder="••••••••"
                  value={form.managerPass}
                  onChange={handleChange('managerPass')}
                  autoComplete="current-password"
                />
                {errors.managerPass && (
                  <p className="form-error" role="alert">{errors.managerPass}</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="spinner-icon" />
                  Adding…
                </>
              ) : (
                'Add Instance'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
