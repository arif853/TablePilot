import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import toast from 'react-hot-toast';
import {
    HiOutlineSpeakerphone,
    HiOutlinePaperAirplane,
    HiOutlineTrash,
    HiOutlinePencil,
    HiOutlineEye,
} from 'react-icons/hi';

export default function AdminAnnouncementsPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [editingAnnouncement, setEditingAnnouncement] = useState(null);
    const [viewingAnnouncement, setViewingAnnouncement] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        body: '',
        type: 'in_app',
        recipients_type: 'all',
        specific_tenant_ids: [],
    });

    const { data, isLoading } = useQuery({
        queryKey: ['admin-announcements'],
        queryFn: () => adminAPI.announcements.list().then(r => r.data.data),
    });

    const { data: tenants } = useQuery({
        queryKey: ['admin-tenants-list'],
        queryFn: () => adminAPI.tenants.list({ per_page: 100 }).then(r => r.data.data),
    });

    const createMutation = useMutation({
        mutationFn: (data) => adminAPI.announcements.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-announcements']);
            closeModal();
            toast.success('Announcement created');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to create'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => adminAPI.announcements.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-announcements']);
            closeModal();
            toast.success('Announcement updated');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => adminAPI.announcements.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-announcements']);
            toast.success('Announcement deleted');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
    });

    const sendMutation = useMutation({
        mutationFn: (id) => adminAPI.announcements.send(id),
        onSuccess: (response) => {
            queryClient.invalidateQueries(['admin-announcements']);
            const data = response.data.data;
            toast.success(
                `Sent to ${data.recipients_count} tenants${data.emails_sent ? `, ${data.emails_sent} emails sent` : ''}`
            );
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to send'),
    });

    const closeModal = () => {
        setShowModal(false);
        setEditingAnnouncement(null);
        setFormData({
            title: '',
            body: '',
            type: 'in_app',
            recipients_type: 'all',
            specific_tenant_ids: [],
        });
    };

    const openEdit = (announcement) => {
        setEditingAnnouncement(announcement);
        setFormData({
            title: announcement.title,
            body: announcement.body,
            type: announcement.type,
            recipients_type: announcement.recipients_type,
            specific_tenant_ids: announcement.specific_tenant_ids || [],
        });
        setShowModal(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingAnnouncement) {
            updateMutation.mutate({ id: editingAnnouncement.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'in_app': return 'In-App';
            case 'email': return 'Email';
            case 'both': return 'Both';
            default: return type;
        }
    };

    const getRecipientsLabel = (type) => {
        switch (type) {
            case 'all': return 'All Tenants';
            case 'active': return 'Active Tenants';
            case 'expiring': return 'Expiring Soon';
            case 'specific': return 'Specific Tenants';
            default: return type;
        }
    };

    if (isLoading) return <LoadingSpinner />;

    const announcements = data?.data || data || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
                    <p className="text-gray-500 mt-1">Send notifications to your tenants</p>
                </div>
                <button onClick={() => setShowModal(true)} className="btn-primary">
                    + New Announcement
                </button>
            </div>

            {/* Announcements List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr className="text-left">
                            <th className="px-4 py-3 font-medium text-gray-600">Title</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Recipients</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                            <th className="px-4 py-3 font-medium text-gray-600">Created</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {announcements.map((announcement) => (
                            <tr key={announcement.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <HiOutlineSpeakerphone className="w-4 h-4 text-gray-400" />
                                        <span className="font-medium text-gray-900">
                                            {announcement.title}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 bg-brand-50 text-brand-800 rounded-full text-xs">
                                        {getTypeLabel(announcement.type)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                    {getRecipientsLabel(announcement.recipients_type)}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={announcement.status === 'sent' ? 'active' : 'pending'}>
                                        {announcement.status}
                                    </StatusBadge>
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {new Date(announcement.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setViewingAnnouncement(announcement);
                                                setShowViewModal(true);
                                            }}
                                            className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                            title="View"
                                        >
                                            <HiOutlineEye className="w-4 h-4" />
                                        </button>
                                        {announcement.status === 'draft' && (
                                            <>
                                                <button
                                                    onClick={() => openEdit(announcement)}
                                                    className="p-1 hover:bg-gray-100 rounded text-gray-500"
                                                    title="Edit"
                                                >
                                                    <HiOutlinePencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => sendMutation.mutate(announcement.id)}
                                                    disabled={sendMutation.isPending}
                                                    className="p-1 hover:bg-green-100 rounded text-green-600"
                                                    title="Send Now"
                                                >
                                                    <HiOutlinePaperAirplane className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => {
                                                if (confirm('Delete this announcement?')) {
                                                    deleteMutation.mutate(announcement.id);
                                                }
                                            }}
                                            className="p-1 hover:bg-red-100 rounded text-red-500"
                                            title="Delete"
                                        >
                                            <HiOutlineTrash className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {announcements.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                                    No announcements yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            <Modal
                isOpen={showModal}
                onClose={closeModal}
                title={editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="label">Title</label>
                        <input
                            type="text"
                            className="input"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            required
                        />
                    </div>

                    <div>
                        <label className="label">Message</label>
                        <textarea
                            className="input min-h-[150px]"
                            value={formData.body}
                            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Type</label>
                            <select
                                className="input"
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="in_app">In-App Only</option>
                                <option value="email">Email Only</option>
                                <option value="both">Both</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Recipients</label>
                            <select
                                className="input"
                                value={formData.recipients_type}
                                onChange={(e) => setFormData({ ...formData, recipients_type: e.target.value })}
                            >
                                <option value="all">All Tenants</option>
                                <option value="active">Active Tenants Only</option>
                                <option value="expiring">Expiring Soon (30 days)</option>
                                <option value="specific">Specific Tenants</option>
                            </select>
                        </div>
                    </div>

                    {formData.recipients_type === 'specific' && (
                        <div>
                            <label className="label">Select Tenants</label>
                            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {tenants?.map((tenant) => (
                                    <label
                                        key={tenant.id}
                                        className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={formData.specific_tenant_ids.includes(tenant.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setFormData({
                                                        ...formData,
                                                        specific_tenant_ids: [...formData.specific_tenant_ids, tenant.id],
                                                    });
                                                } else {
                                                    setFormData({
                                                        ...formData,
                                                        specific_tenant_ids: formData.specific_tenant_ids.filter(
                                                            (id) => id !== tenant.id
                                                        ),
                                                    });
                                                }
                                            }}
                                            className="w-4 h-4 text-brand-700 rounded"
                                        />
                                        <span className="text-sm">{tenant.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {createMutation.isPending || updateMutation.isPending
                                ? 'Saving...'
                                : editingAnnouncement
                                ? 'Update'
                                : 'Create Draft'}
                        </button>
                        <button type="button" onClick={closeModal} className="btn-secondary">
                            Cancel
                        </button>
                    </div>
                </form>
            </Modal>

            {/* View Modal */}
            <Modal
                isOpen={showViewModal}
                onClose={() => setShowViewModal(false)}
                title="Announcement Details"
            >
                {viewingAnnouncement && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-gray-500 uppercase">Title</label>
                            <p className="font-medium text-gray-900">{viewingAnnouncement.title}</p>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase">Message</label>
                            <p className="text-gray-700 whitespace-pre-wrap">{viewingAnnouncement.body}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Type</label>
                                <p className="text-gray-700">{getTypeLabel(viewingAnnouncement.type)}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Recipients</label>
                                <p className="text-gray-700">{getRecipientsLabel(viewingAnnouncement.recipients_type)}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-500 uppercase">Status</label>
                                <p className="text-gray-700 capitalize">{viewingAnnouncement.status}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 uppercase">
                                    {viewingAnnouncement.status === 'sent' ? 'Sent At' : 'Created At'}
                                </label>
                                <p className="text-gray-700">
                                    {new Date(viewingAnnouncement.sent_at || viewingAnnouncement.created_at).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase">Created By</label>
                            <p className="text-gray-700">{viewingAnnouncement.created_by?.name || 'Unknown'}</p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
