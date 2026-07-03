import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import toast from 'react-hot-toast';

const FILTERS = ['verified', 'pending', 'approved', 'rejected', 'all'];

export default function AdminTenantApplicationsPage() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState('verified');
    const [selected, setSelected] = useState(null);
    const [mode, setMode] = useState('approve');
    const [notes, setNotes] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['admin-tenant-applications', filter],
        queryFn: () => adminAPI.tenantApplications.list(filter === 'all' ? undefined : { status: filter }).then((r) => r.data.data),
    });

    const approveMutation = useMutation({
        mutationFn: ({ id, approval_notes }) => adminAPI.tenantApplications.approve(id, { approval_notes }),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-tenant-applications']);
            toast.success('Application approved');
            setSelected(null);
            setNotes('');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Approval failed'),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, approval_notes }) => adminAPI.tenantApplications.reject(id, { approval_notes }),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-tenant-applications']);
            toast.success('Application rejected');
            setSelected(null);
            setNotes('');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Rejection failed'),
    });

    const visibleRows = useMemo(() => data || [], [data]);

    const openDecision = (application, decision) => {
        setSelected(application);
        setMode(decision);
        setNotes(application?.approval_notes || '');
    };

    const submitDecision = () => {
        if (!selected) return;

        if (mode === 'approve') {
            approveMutation.mutate({ id: selected.id, approval_notes: notes });
        } else {
            rejectMutation.mutate({ id: selected.id, approval_notes: notes });
        }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Tenant Applications</h2>
                    <p className="text-sm text-gray-500">Review verified applications and approve them into active tenants.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {FILTERS.map((option) => (
                        <button
                            key={option}
                            onClick={() => setFilter(option)}
                            className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${filter === option ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left border-b">
                            <th className="pb-3">Restaurant</th>
                            <th className="pb-3">Applicant</th>
                            <th className="pb-3">Plan</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3">Verification</th>
                            <th className="pb-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map((application) => (
                            <tr key={application.id} className="border-b last:border-0">
                                <td className="py-3">
                                    <p className="font-medium text-gray-900">{application.restaurant_name}</p>
                                    <p className="text-xs text-gray-500">{application.phone}</p>
                                </td>
                                <td className="py-3">
                                    <p className="text-gray-900">{application.user?.name}</p>
                                    <p className="text-xs text-gray-500">{application.user?.email}</p>
                                </td>
                                <td className="py-3">
                                    <p className="text-gray-900">{application.plan?.name || application.plan_snapshot?.name || 'N/A'}</p>
                                    <p className="text-xs text-gray-500">Trial {application.trial_days_snapshot || 0} days</p>
                                </td>
                                <td className="py-3"><StatusBadge status={application.status} /></td>
                                <td className="py-3 text-gray-600">
                                    {application.email_verified_at ? new Date(application.email_verified_at).toLocaleString() : 'Not verified'}
                                </td>
                                <td className="py-3 text-right">
                                    <div className="flex justify-end gap-3">
                                        {application.status === 'verified' && (
                                            <button onClick={() => openDecision(application, 'approve')} className="text-blue-600 hover:text-blue-700 font-medium">Approve</button>
                                        )}
                                        {application.status !== 'approved' && (
                                            <button onClick={() => openDecision(application, 'reject')} className="text-red-600 hover:text-red-700 font-medium">Reject</button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {visibleRows.length === 0 && (
                <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                    No applications found for the selected filter.
                </div>
            )}

            <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={mode === 'approve' ? 'Approve application' : 'Reject application'} size="lg">
                {selected && (
                    <div className="space-y-4">
                        <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                            <p className="font-medium text-gray-900">{selected.restaurant_name}</p>
                            <p>{selected.user?.name} · {selected.user?.email}</p>
                            <p>{selected.plan?.name || selected.plan_snapshot?.name}</p>
                        </div>

                        <div>
                            <label className="label">Notes</label>
                            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-28" placeholder="Optional review notes" />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={submitDecision}
                                className={`btn-primary ${mode === 'reject' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                                {(approveMutation.isPending || rejectMutation.isPending) ? 'Saving...' : (mode === 'approve' ? 'Approve' : 'Reject')}
                            </button>
                            <button type="button" onClick={() => setSelected(null)} className="btn-secondary">Cancel</button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
