import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import {
    HiOutlineServer,
    HiOutlineDatabase,
    HiOutlineColorSwatch,
    HiOutlineCollection,
    HiOutlineLink,
    HiOutlineRefresh,
    HiOutlineTrash,
    HiOutlineCheckCircle,
    HiOutlineExclamationCircle,
    HiOutlineExclamation,
} from 'react-icons/hi';

const StatusIcon = ({ status }) => {
    switch (status) {
        case 'ok':
            return <HiOutlineCheckCircle className="w-6 h-6 text-green-500" />;
        case 'error':
            return <HiOutlineExclamationCircle className="w-6 h-6 text-red-500" />;
        case 'warning':
            return <HiOutlineExclamation className="w-6 h-6 text-yellow-500" />;
        default:
            return <HiOutlineServer className="w-6 h-6 text-gray-400" />;
    }
};

export default function AdminSystemPage() {
    const queryClient = useQueryClient();
    const [logLines, setLogLines] = useState(100);
    const [storageLinkStatus, setStorageLinkStatus] = useState(null);

    const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
        queryKey: ['admin-system-health'],
        queryFn: () => adminAPI.system.health().then(r => r.data.data),
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    const { data: systemInfo, isLoading: infoLoading } = useQuery({
        queryKey: ['admin-system-info'],
        queryFn: () => adminAPI.system.info().then(r => r.data.data),
    });

    const { data: queueStats, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
        queryKey: ['admin-queue-stats'],
        queryFn: () => adminAPI.system.queueStats().then(r => r.data.data),
        refetchInterval: 10000, // Refresh every 10 seconds
    });

    const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
        queryKey: ['admin-system-logs', logLines],
        queryFn: () => adminAPI.system.logs(logLines).then(r => r.data.data),
    });

    const clearCacheMutation = useMutation({
        mutationFn: (type) => adminAPI.system.clearCache(type),
        onSuccess: (response) => {
            toast.success(response.data.message || 'Cache cleared');
            refetchHealth();
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to clear cache'),
    });

    const retryJobsMutation = useMutation({
        mutationFn: () => adminAPI.system.retryFailedJobs(),
        onSuccess: (response) => {
            toast.success(response.data.message || 'Jobs retried');
            refetchQueue();
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to retry jobs'),
    });

    const storageLinkMutation = useMutation({
        mutationFn: () => adminAPI.system.storageLink(),
        onSuccess: (response) => {
            const payload = response?.data?.data || {};

            if (payload.already_exists) {
                setStorageLinkStatus({
                    type: 'exists',
                    label: 'Link already exists',
                });
            } else if (payload.linked) {
                setStorageLinkStatus({
                    type: 'linked',
                    label: 'Storage linked',
                });
            } else {
                setStorageLinkStatus({
                    type: 'unknown',
                    label: 'Completed',
                });
            }

            toast.success(response.data.message || 'Storage link completed');
            refetchHealth();
        },
        onError: (err) => {
            setStorageLinkStatus({
                type: 'failed',
                label: 'Link failed',
            });
            toast.error(err.response?.data?.message || 'Failed to create storage link');
        },
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'healthy': return 'text-green-600 bg-green-50';
            case 'degraded': return 'text-yellow-600 bg-yellow-50';
            case 'unhealthy': return 'text-red-600 bg-red-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const getLogLevelColor = (level) => {
        switch (level) {
            case 'error': return 'text-red-500';
            case 'warning': return 'text-yellow-600';
            case 'debug': return 'text-gray-400';
            default: return 'text-gray-600';
        }
    };

    if (healthLoading && infoLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">System Management</h1>
                    <p className="text-gray-500 mt-1">Monitor system health and manage caches</p>
                </div>
                <div className={`px-4 py-2 rounded-full font-medium ${getStatusColor(health?.status)}`}>
                    System: {health?.status?.toUpperCase() || 'CHECKING...'}
                </div>
            </div>

            {/* Health Checks */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {health?.checks && Object.entries(health.checks).map(([name, check]) => (
                    <div key={name} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm text-gray-500 capitalize">{name}</p>
                                <p className="font-semibold text-gray-900 mt-1">{check.message}</p>
                                {check.driver && (
                                    <p className="text-xs text-gray-400 mt-1">Driver: {check.driver}</p>
                                )}
                            </div>
                            <StatusIcon status={check.status} />
                        </div>
                    </div>
                ))}
            </div>

            {/* System Info */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">System Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {systemInfo && Object.entries(systemInfo).map(([key, value]) => (
                        <div key={key}>
                            <p className="text-xs text-gray-500 uppercase">{key.replace(/_/g, ' ')}</p>
                            <p className="font-medium text-gray-900">{String(value)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Queue Stats */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Queue Status</h3>
                    <button
                        onClick={() => refetchQueue()}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <HiOutlineRefresh className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pending Jobs */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500">Pending Jobs</span>
                            <span className="text-2xl font-bold text-brand-700">
                                {queueStats?.pending?.total || 0}
                            </span>
                        </div>
                        {queueStats?.pending?.by_queue?.length > 0 && (
                            <div className="space-y-1">
                                {queueStats.pending.by_queue.map((q) => (
                                    <div key={q.queue} className="flex justify-between text-sm">
                                        <span className="text-gray-500">{q.queue}</span>
                                        <span className="text-gray-700">{q.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Failed Jobs */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500">Failed Jobs</span>
                            <span className="text-2xl font-bold text-red-600">
                                {queueStats?.failed?.total || 0}
                            </span>
                        </div>
                        {queueStats?.failed?.total > 0 && (
                            <button
                                onClick={() => retryJobsMutation.mutate()}
                                disabled={retryJobsMutation.isPending}
                                className="btn-secondary w-full text-sm mt-2"
                            >
                                {retryJobsMutation.isPending ? 'Retrying...' : 'Retry All Failed Jobs'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Recent Failed Jobs */}
                {queueStats?.failed?.recent?.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500 mb-2">Recent Failures</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {queueStats.failed.recent.map((job) => (
                                <div key={job.id} className="text-xs bg-red-50 p-2 rounded">
                                    <div className="flex justify-between">
                                        <span className="font-mono text-red-700">{job.queue}</span>
                                        <span className="text-red-500">{job.failed_at}</span>
                                    </div>
                                    <p className="text-red-600 truncate mt-1">{job.exception_preview}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Cache Management */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">Cache Management</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <button
                        onClick={() => clearCacheMutation.mutate('all')}
                        disabled={clearCacheMutation.isPending}
                        className="btn-secondary flex flex-col items-center gap-2 py-4"
                    >
                        <HiOutlineTrash className="w-5 h-5" />
                        Clear All
                    </button>
                    <button
                        onClick={() => clearCacheMutation.mutate('cache')}
                        disabled={clearCacheMutation.isPending}
                        className="btn-secondary flex flex-col items-center gap-2 py-4"
                    >
                        <HiOutlineDatabase className="w-5 h-5" />
                        App Cache
                    </button>
                    <button
                        onClick={() => clearCacheMutation.mutate('config')}
                        disabled={clearCacheMutation.isPending}
                        className="btn-secondary flex flex-col items-center gap-2 py-4"
                    >
                        <HiOutlineColorSwatch className="w-5 h-5" />
                        Config
                    </button>
                    <button
                        onClick={() => clearCacheMutation.mutate('routes')}
                        disabled={clearCacheMutation.isPending}
                        className="btn-secondary flex flex-col items-center gap-2 py-4"
                    >
                        <HiOutlineServer className="w-5 h-5" />
                        Routes
                    </button>
                    <button
                        onClick={() => clearCacheMutation.mutate('views')}
                        disabled={clearCacheMutation.isPending}
                        className="btn-secondary flex flex-col items-center gap-2 py-4"
                    >
                        <HiOutlineCollection className="w-5 h-5" />
                        Views
                    </button>
                </div>
            </div>

            {/* Storage Management */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Storage Management</h3>
                    {storageLinkStatus && (
                        <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                                storageLinkStatus.type === 'linked'
                                    ? 'text-green-700 bg-green-100'
                                    : storageLinkStatus.type === 'exists'
                                        ? 'text-blue-700 bg-blue-100'
                                        : storageLinkStatus.type === 'failed'
                                            ? 'text-red-700 bg-red-100'
                                            : 'text-gray-700 bg-gray-100'
                            }`}
                        >
                            {storageLinkStatus.label}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => storageLinkMutation.mutate()}
                    disabled={storageLinkMutation.isPending}
                    className="btn-secondary flex items-center justify-center gap-2 py-3 px-4"
                >
                    <HiOutlineLink className="w-5 h-5" />
                    {storageLinkMutation.isPending ? 'Linking Storage...' : 'Run Storage Link'}
                </button>
            </div>

            {/* Log Viewer */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Recent Logs</h3>
                    <div className="flex items-center gap-2">
                        <select
                            value={logLines}
                            onChange={(e) => setLogLines(parseInt(e.target.value))}
                            className="input w-24 py-1 text-sm"
                        >
                            <option value={50}>50 lines</option>
                            <option value={100}>100 lines</option>
                            <option value={200}>200 lines</option>
                            <option value={500}>500 lines</option>
                        </select>
                        <button
                            onClick={() => refetchLogs()}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <HiOutlineRefresh className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-xs">
                    {logsLoading ? (
                        <p className="text-gray-500">Loading logs...</p>
                    ) : logs?.logs?.length > 0 ? (
                        logs.logs.map((log, i) => (
                            <div key={i} className={`${getLogLevelColor(log.level)} whitespace-pre-wrap break-all`}>
                                {log.line}
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No logs available</p>
                    )}
                </div>

                {logs?.total_lines && (
                    <p className="text-xs text-gray-400 mt-2">
                        Showing {logs.showing} of {logs.total_lines} total lines
                    </p>
                )}
            </div>
        </div>
    );
}
