import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import {
    HiOutlineMail,
    HiOutlinePhone,
    HiOutlineEye,
    HiOutlineTrash,
    HiOutlineCheck,
    HiOutlineX,
    HiOutlineFilter,
    HiOutlineReply,
} from 'react-icons/hi';

export default function AdminEnquiriesPage() {
    const queryClient = useQueryClient();
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [showReplyModal, setShowReplyModal] = useState(false);
    const [filters, setFilters] = useState({ status: '', search: '' });
    const [page, setPage] = useState(1);
    const [replyMessage, setReplyMessage] = useState('');

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['admin-enquiries', page, filters],
        queryFn: () => adminAPI.enquiries.list({ page, per_page: 20, ...filters }).then(r => r.data),
    });

    const markReadMutation = useMutation({
        mutationFn: (id) => adminAPI.enquiries.markRead(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-enquiries']);
            toast.success('Marked as read');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => adminAPI.enquiries.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-enquiries']);
            toast.success('Enquiry deleted');
            setSelectedEnquiry(null);
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
    });

    const replyMutation = useMutation({
        mutationFn: ({ id, message }) => adminAPI.enquiries.reply(id, { message }),
        onSuccess: () => {
            queryClient.invalidateQueries(['admin-enquiries']);
            toast.success('Reply sent');
            setShowReplyModal(false);
            setReplyMessage('');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to send reply'),
    });

    const getStatusBadge = (status) => {
        switch (status) {
            case 'new':
                return <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">New</span>;
            case 'read':
                return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Read</span>;
            case 'replied':
                return <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Replied</span>;
            default:
                return <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{status}</span>;
        }
    };

    if (isLoading) return <LoadingSpinner />;

    const enquiries = data?.data || [];
    const pagination = data?.meta;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Contact Enquiries</h1>
                <p className="text-gray-500 mt-1">Manage customer inquiries and messages</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-2xl font-bold text-gray-900">{pagination?.total || 0}</p>
                    <p className="text-sm text-gray-500">Total Enquiries</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-2xl font-bold text-brand-700">
                        {enquiries.filter(e => e.status === 'new').length}
                    </p>
                    <p className="text-sm text-gray-500">New</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-2xl font-bold text-yellow-600">
                        {enquiries.filter(e => e.status === 'read').length}
                    </p>
                    <p className="text-sm text-gray-500">Pending Reply</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-2xl font-bold text-green-600">
                        {enquiries.filter(e => e.status === 'replied').length}
                    </p>
                    <p className="text-sm text-gray-500">Replied</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-4">
                <HiOutlineFilter className="w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => {
                        setFilters(prev => ({ ...prev, search: e.target.value }));
                        setPage(1);
                    }}
                    placeholder="Search by name, email, or message..."
                    className="input flex-1"
                />
                <select
                    value={filters.status}
                    onChange={(e) => {
                        setFilters(prev => ({ ...prev, status: e.target.value }));
                        setPage(1);
                    }}
                    className="input w-40"
                >
                    <option value="">All Status</option>
                    <option value="new">New</option>
                    <option value="read">Read</option>
                    <option value="replied">Replied</option>
                </select>
            </div>

            {/* Enquiries List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Contact</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Subject</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tenant</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {enquiries.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-4 py-12 text-center text-gray-500">
                                    <HiOutlineMail className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                    No enquiries found
                                </td>
                            </tr>
                        ) : (
                            enquiries.map((enquiry) => (
                                <tr key={enquiry.id} className={`hover:bg-gray-50 ${enquiry.status === 'new' ? 'bg-blue-50/50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900">{enquiry.name}</p>
                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <HiOutlineMail className="w-3 h-3" />
                                                {enquiry.email}
                                            </span>
                                            {enquiry.phone && (
                                                <span className="flex items-center gap-1">
                                                    <HiOutlinePhone className="w-3 h-3" />
                                                    {enquiry.phone}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-sm text-gray-900 truncate max-w-xs">
                                            {enquiry.subject || 'No subject'}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate max-w-xs">{enquiry.message}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                        {enquiry.tenant?.name || 'General'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {getStatusBadge(enquiry.status)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {new Date(enquiry.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedEnquiry(enquiry);
                                                    if (enquiry.status === 'new') {
                                                        markReadMutation.mutate(enquiry.id);
                                                    }
                                                }}
                                                className="text-gray-400 hover:text-gray-600"
                                                title="View"
                                            >
                                                <HiOutlineEye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedEnquiry(enquiry);
                                                    setShowReplyModal(true);
                                                }}
                                                className="text-gray-400 hover:text-brand-700"
                                                title="Reply"
                                            >
                                                <HiOutlineReply className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm('Delete this enquiry?')) {
                                                        deleteMutation.mutate(enquiry.id);
                                                    }
                                                }}
                                                className="text-gray-400 hover:text-red-600"
                                                title="Delete"
                                            >
                                                <HiOutlineTrash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {pagination && pagination.last_page > 1 && (
                    <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            Showing {pagination.from} to {pagination.to} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(page - 1)}
                                disabled={page === 1}
                                className="btn-secondary py-1 px-3 text-sm disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(page + 1)}
                                disabled={page >= pagination.last_page}
                                className="btn-secondary py-1 px-3 text-sm disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* View Modal */}
            {selectedEnquiry && !showReplyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg">
                        <div className="p-6 border-b flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">Enquiry Details</h3>
                            <button onClick={() => setSelectedEnquiry(null)} className="text-gray-400 hover:text-gray-600">
                                <HiOutlineX className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="font-semibold text-gray-900">{selectedEnquiry.name}</p>
                                    <p className="text-sm text-gray-500">{selectedEnquiry.email}</p>
                                    {selectedEnquiry.phone && (
                                        <p className="text-sm text-gray-500">{selectedEnquiry.phone}</p>
                                    )}
                                </div>
                                {getStatusBadge(selectedEnquiry.status)}
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Subject</p>
                                <p className="text-gray-900">{selectedEnquiry.subject || 'No subject'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Message</p>
                                <p className="text-gray-700 whitespace-pre-wrap">{selectedEnquiry.message}</p>
                            </div>
                            <div className="flex items-center justify-between text-sm text-gray-500">
                                <span>Tenant: {selectedEnquiry.tenant?.name || 'General'}</span>
                                <span>{new Date(selectedEnquiry.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="p-6 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedEnquiry(null)}
                                className="btn-secondary"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => setShowReplyModal(true)}
                                className="btn-primary flex items-center gap-2"
                            >
                                <HiOutlineReply className="w-4 h-4" />
                                Reply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reply Modal */}
            {selectedEnquiry && showReplyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg">
                        <div className="p-6 border-b">
                            <h3 className="text-lg font-semibold text-gray-900">Reply to {selectedEnquiry.name}</h3>
                            <p className="text-sm text-gray-500">{selectedEnquiry.email}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">Original Message:</p>
                                <p className="text-sm text-gray-700">{selectedEnquiry.message}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Your Reply</label>
                                <textarea
                                    value={replyMessage}
                                    onChange={(e) => setReplyMessage(e.target.value)}
                                    rows={6}
                                    className="input w-full"
                                    placeholder="Type your reply..."
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowReplyModal(false);
                                    setReplyMessage('');
                                }}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => replyMutation.mutate({ id: selectedEnquiry.id, message: replyMessage })}
                                disabled={!replyMessage.trim() || replyMutation.isPending}
                                className="btn-primary"
                            >
                                {replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
