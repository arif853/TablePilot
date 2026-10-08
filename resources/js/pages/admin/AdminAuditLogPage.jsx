import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {
    HiOutlineDocumentText,
    HiOutlineFilter,
    HiOutlineDownload,
    HiOutlineChevronDown,
    HiOutlineChevronRight,
    HiOutlineEye,
    HiOutlineSearch,
    HiOutlineX,
} from 'react-icons/hi';

export default function AdminAuditLogPage() {
    const [filters, setFilters] = useState({
        action: '',
        user_id: '',
        tenant_id: '',
        from_date: '',
        to_date: '',
    });
    const [page, setPage] = useState(1);
    const [expandedLogs, setExpandedLogs] = useState(new Set());
    const [showFilters, setShowFilters] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const { data, isLoading } = useQuery({
        queryKey: ['admin-audit-logs', page, filters],
        queryFn: () => adminAPI.auditLogs.list({ page, per_page: 25, ...filters }).then(r => r.data),
    });

    const { data: actions } = useQuery({
        queryKey: ['admin-audit-actions'],
        queryFn: () => adminAPI.auditLogs.actions().then(r => r.data.data),
    });

    const { data: stats } = useQuery({
        queryKey: ['admin-audit-stats'],
        queryFn: () => adminAPI.auditLogs.stats().then(r => r.data.data),
    });

    const toggleExpand = (logId) => {
        const newExpanded = new Set(expandedLogs);
        if (newExpanded.has(logId)) {
            newExpanded.delete(logId);
        } else {
            newExpanded.add(logId);
        }
        setExpandedLogs(newExpanded);
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setFilters({ action: '', user_id: '', tenant_id: '', from_date: '', to_date: '' });
        setPage(1);
    };

    const handleExport = () => {
        adminAPI.auditLogs.export(filters).then(response => {
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
    };

    const getActionColor = (action) => {
        if (action.includes('created') || action.includes('login')) return 'bg-green-100 text-green-700';
        if (action.includes('updated')) return 'bg-blue-100 text-blue-700';
        if (action.includes('deleted')) return 'bg-red-100 text-red-700';
        if (action.includes('impersonat')) return 'bg-purple-100 text-purple-700';
        return 'bg-gray-100 text-gray-700';
    };

    const formatValue = (val) => {
        if (val === null || val === undefined) return <span className="text-gray-400">null</span>;
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'object') return JSON.stringify(val, null, 2);
        return String(val);
    };

    const renderDiff = (oldValues, newValues) => {
        if (!oldValues && !newValues) return null;

        const allKeys = new Set([
            ...Object.keys(oldValues || {}),
            ...Object.keys(newValues || {})
        ]);

        return (
            <div className="text-xs font-mono space-y-1">
                {Array.from(allKeys).map(key => {
                    const oldVal = oldValues?.[key];
                    const newVal = newValues?.[key];
                    const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);

                    return (
                        <div key={key} className={changed ? 'bg-yellow-50 px-2 py-1 rounded' : 'px-2 py-1'}>
                            <span className="text-gray-500">{key}:</span>{' '}
                            {oldValues && newValues && changed ? (
                                <>
                                    <span className="text-red-500 line-through">{formatValue(oldVal)}</span>
                                    {' → '}
                                    <span className="text-green-600">{formatValue(newVal)}</span>
                                </>
                            ) : (
                                <span className="text-gray-700">{formatValue(newVal ?? oldVal)}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const hasActiveFilters = Object.values(filters).some(v => v);

    if (isLoading) return <LoadingSpinner />;

    const logs = data?.data || [];
    const pagination = data?.meta;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
                    <p className="text-gray-500 mt-1">Track all system activities and changes</p>
                </div>
                <button
                    onClick={handleExport}
                    className="btn-secondary flex items-center gap-2"
                >
                    <HiOutlineDownload className="w-4 h-4" />
                    Export CSV
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-2xl font-bold text-gray-900">{stats.total_logs?.toLocaleString() || 0}</p>
                        <p className="text-sm text-gray-500">Total Logs</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-2xl font-bold text-brand-700">{stats.today || 0}</p>
                        <p className="text-sm text-gray-500">Today</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-2xl font-bold text-green-600">{stats.this_week || 0}</p>
                        <p className="text-sm text-gray-500">This Week</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-2xl font-bold text-purple-600">{stats.unique_users || 0}</p>
                        <p className="text-sm text-gray-500">Active Users</p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="w-full px-6 py-4 flex items-center justify-between"
                >
                    <div className="flex items-center gap-2">
                        <HiOutlineFilter className="w-5 h-5 text-gray-500" />
                        <span className="font-medium text-gray-700">Filters</span>
                        {hasActiveFilters && (
                            <span className="bg-primary-100 text-primary-700 text-xs px-2 py-0.5 rounded-full">
                                Active
                            </span>
                        )}
                    </div>
                    <HiOutlineChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>

                {showFilters && (
                    <div className="px-6 pb-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Action</label>
                                <select
                                    value={filters.action}
                                    onChange={(e) => handleFilterChange('action', e.target.value)}
                                    className="input w-full"
                                >
                                    <option value="">All Actions</option>
                                    {actions?.map(action => (
                                        <option key={action} value={action}>{action}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">User ID</label>
                                <input
                                    type="text"
                                    value={filters.user_id}
                                    onChange={(e) => handleFilterChange('user_id', e.target.value)}
                                    className="input w-full"
                                    placeholder="Filter by user"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Tenant ID</label>
                                <input
                                    type="text"
                                    value={filters.tenant_id}
                                    onChange={(e) => handleFilterChange('tenant_id', e.target.value)}
                                    className="input w-full"
                                    placeholder="Filter by tenant"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">From Date</label>
                                <input
                                    type="date"
                                    value={filters.from_date}
                                    onChange={(e) => handleFilterChange('from_date', e.target.value)}
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">To Date</label>
                                <input
                                    type="date"
                                    value={filters.to_date}
                                    onChange={(e) => handleFilterChange('to_date', e.target.value)}
                                    className="input w-full"
                                />
                            </div>
                        </div>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="mt-3 text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                            >
                                <HiOutlineX className="w-4 h-4" />
                                Clear all filters
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500"></th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Timestamp</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Action</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">User</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tenant</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Subject</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">IP Address</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="px-4 py-12 text-center text-gray-500">
                                    <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                    No audit logs found
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            {(log.old_values || log.new_values) && (
                                                <button
                                                    onClick={() => toggleExpand(log.id)}
                                                    className="text-gray-400 hover:text-gray-600"
                                                >
                                                    {expandedLogs.has(log.id) ? (
                                                        <HiOutlineChevronDown className="w-4 h-4" />
                                                    ) : (
                                                        <HiOutlineChevronRight className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-900">{log.user?.name || '-'}</span>
                                            {log.user?.email && (
                                                <span className="text-xs text-gray-500 block">{log.user.email}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {log.tenant?.name || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {log.subject_type && (
                                                <>
                                                    <span className="text-gray-900">
                                                        {log.subject_type.split('\\').pop()}
                                                    </span>
                                                    <span className="text-gray-400"> #{log.subject_id}</span>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                                            {log.ip_address || '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="text-gray-400 hover:text-gray-600"
                                            >
                                                <HiOutlineEye className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedLogs.has(log.id) && (
                                        <tr className="bg-gray-50">
                                            <td colSpan="8" className="px-4 py-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-xs text-gray-500 mb-2">Old Values</p>
                                                        <div className="bg-white rounded p-3 border">
                                                            {log.old_values ? (
                                                                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                                                                    {JSON.stringify(log.old_values, null, 2)}
                                                                </pre>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">No old values</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-500 mb-2">New Values</p>
                                                        <div className="bg-white rounded p-3 border">
                                                            {log.new_values ? (
                                                                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                                                                    {JSON.stringify(log.new_values, null, 2)}
                                                                </pre>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">No new values</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {pagination && pagination.last_page > 1 && (
                    <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                        <p className="text-sm text-gray-500">
                            Showing {pagination.from} to {pagination.to} of {pagination.total} entries
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(page - 1)}
                                disabled={page === 1}
                                className="btn-secondary py-1 px-3 text-sm disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <span className="py-1 px-3 text-sm text-gray-600">
                                Page {page} of {pagination.last_page}
                            </span>
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

            {/* Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
                            <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                                <HiOutlineX className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">Action</p>
                                    <span className={`text-sm px-2 py-1 rounded-full ${getActionColor(selectedLog.action)}`}>
                                        {selectedLog.action}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Timestamp</p>
                                    <p className="text-sm text-gray-900">{new Date(selectedLog.created_at).toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">User</p>
                                    <p className="text-sm text-gray-900">{selectedLog.user?.name || '-'}</p>
                                    {selectedLog.user?.email && (
                                        <p className="text-xs text-gray-500">{selectedLog.user.email}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Tenant</p>
                                    <p className="text-sm text-gray-900">{selectedLog.tenant?.name || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Subject</p>
                                    <p className="text-sm text-gray-900">
                                        {selectedLog.subject_type?.split('\\').pop() || '-'} #{selectedLog.subject_id || '-'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">IP Address</p>
                                    <p className="text-sm font-mono text-gray-900">{selectedLog.ip_address || '-'}</p>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-3">Changes</p>
                                {renderDiff(selectedLog.old_values, selectedLog.new_values)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
