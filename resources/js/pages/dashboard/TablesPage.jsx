import React, { useEffect, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableAPI, authAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import TableQRCard from '../../components/TableQRCard';
import QRCardFace, { QR_CARD_PAGE_STYLE } from '../../components/qr/QRCardFace';
import { HiOutlinePrinter, HiOutlineShoppingBag } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function TablesPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [qrCard, setQrCard] = useState(null);
    const [bulkCards, setBulkCards] = useState(null);
    const [bulkLoading, setBulkLoading] = useState(false);
    const bulkPrintRef = useRef(null);
    const [editing, setEditing] = useState(null);
    const { user } = useAuthStore();
    // Staff can view, transfer and print QR codes; only admins change the floor plan
    const isAdmin = user?.role === 'restaurant_admin';

    const { data: tables, isLoading } = useQuery({
        queryKey: ['tables'],
        queryFn: () => tableAPI.list().then((r) => r.data.data),
    });

    const { data: profileData, isLoading: profileLoading } = useQuery({
        queryKey: ['profile'],
        queryFn: () => authAPI.me().then((r) => r.data.data),
    });

    const saveMutation = useMutation({
        mutationFn: (data) => editing ? tableAPI.update(editing.id, data) : tableAPI.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['tables']);
            setShowForm(false);
            setEditing(null);
            toast.success(editing ? 'Updated' : 'Table created');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    const transferMutation = useMutation({
        mutationFn: (data) => tableAPI.transfer(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['tables']);
            setShowTransfer(false);
            toast.success('Table transferred!');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Transfer failed'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => tableAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['tables']);
            toast.success('Table deleted');
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Error'),
    });

    // /auth/me returns { user: { tenant } }; the card needs the restaurant's name, logo, colours and contact
    const tenant = profileData?.user?.tenant;

    const handleShowQr = async (table) => {
        try {
            const { data } = await tableAPI.qrCode(table.id);
            setQrCard({ label: 'Table', title: table.table_number, qrUrl: data.data.qr_url, fileName: `table-${table.table_number}` });
        } catch {
            toast.error('Failed to load the QR code');
        }
    };

    const handleShowTakeawayQr = async () => {
        try {
            const { data } = await tableAPI.parcelQr();
            setQrCard({ label: 'Takeaway', title: 'Order to go', qrUrl: data.data.qr_url, fileName: 'takeaway' });
        } catch {
            toast.error('Failed to load the takeaway QR code');
        }
    };

    const printAllCards = useReactToPrint({
        contentRef: bulkPrintRef,
        documentTitle: 'table-qr-cards',
        pageStyle: QR_CARD_PAGE_STYLE,
        onAfterPrint: () => setBulkCards(null),
        onPrintError: () => {
            setBulkCards(null);
            toast.error('Could not open the print dialog');
        },
    });

    const handlePrintAll = async () => {
        setBulkLoading(true);
        try {
            const { data } = await tableAPI.qrCodes();
            if (!data.data.length) {
                toast.error('Add a table first');
                return;
            }
            setBulkCards(data.data);
        } catch {
            toast.error('Failed to prepare the QR cards');
        } finally {
            setBulkLoading(false);
        }
    };

    // Print once the off-screen sheet has rendered every card. Keyed on the card set only:
    // printAllCards is a new function each render, and re-running would reopen the dialog.
    useEffect(() => {
        if (bulkCards?.length) printAllCards();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bulkCards]);

    if (isLoading || profileLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Tables</h2>
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={handleShowTakeawayQr} className="btn-secondary text-sm sm:text-base flex items-center gap-1.5">
                        <HiOutlineShoppingBag className="w-4 h-4" /> Takeaway QR
                    </button>
                    {tables?.length > 0 && (
                        <button onClick={handlePrintAll} disabled={bulkLoading} className="btn-secondary text-sm sm:text-base flex items-center gap-1.5 disabled:opacity-50">
                            <HiOutlinePrinter className="w-4 h-4" /> {bulkLoading ? 'Preparing…' : 'Print all QR'}
                        </button>
                    )}
                    <button onClick={() => setShowTransfer(true)} className="btn-secondary text-sm sm:text-base">Transfer</button>
                    {isAdmin && (
                        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary text-sm sm:text-base">+ Add Table</button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {tables?.map((table) => (
                    <div key={table.id} className={`card text-center cursor-pointer hover:shadow-md transition ${table.status === 'occupied' ? 'border-red-200 bg-red-50' : ''}`}>
                        <p className="text-2xl font-bold text-gray-800">{table.table_number}</p>
                        <StatusBadge status={table.status} />
                        <p className="text-xs text-gray-400 mt-2">Cap: {table.capacity}</p>
                        {table.active_orders_count > 0 && (
                            <p className="text-xs text-red-600 mt-1">{table.active_orders_count} active orders</p>
                        )}
                        <div className="flex justify-center gap-2 mt-3 pt-3 border-t">
                            <button onClick={() => handleShowQr(table)} className="text-xs text-brand-700">QR</button>
                            {isAdmin && (
                                <>
                                    <button onClick={() => { setEditing(table); setShowForm(true); }} className="text-xs text-gray-600">Edit</button>
                                    <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(table.id); }} className="text-xs text-red-600">Del</button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Create/Edit Form */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Table' : 'Add Table'}>
                <form onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); saveMutation.mutate(d); }} className="space-y-4">
                    <div>
                        <label className="label">Table Number</label>
                        <input name="table_number" className="input" defaultValue={editing?.table_number} required />
                    </div>
                    <div>
                        <label className="label">Capacity</label>
                        <input name="capacity" type="number" className="input" defaultValue={editing?.capacity || 4} min={1} />
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>Save</button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>

            {/* Transfer Modal */}
            <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Table">
                <form onSubmit={(e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); transferMutation.mutate(d); }} className="space-y-4">
                    <div>
                        <label className="label">From Table</label>
                        <select name="from_table_id" className="input" required>
                            <option value="">Select...</option>
                            {tables?.filter((t) => t.status === 'occupied').map((t) => (
                                <option key={t.id} value={t.id}>{t.table_number}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">To Table</label>
                        <select name="to_table_id" className="input" required>
                            <option value="">Select...</option>
                            {tables?.filter((t) => t.status === 'available').map((t) => (
                                <option key={t.id} value={t.id}>{t.table_number}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <button type="submit" className="btn-primary" disabled={transferMutation.isPending}>Transfer</button>
                        <button type="button" onClick={() => setShowTransfer(false)} className="btn-secondary">Cancel</button>
                    </div>
                </form>
            </Modal>

            {/* QR Code Card Modal */}
            <TableQRCard isOpen={!!qrCard} onClose={() => setQrCard(null)} tenant={tenant} card={qrCard} />

            {/* Off-screen sheet for "Print all QR": one 4x6 card per page */}
            {bulkCards && (
                <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0 }}>
                    <div ref={bulkPrintRef}>
                        {bulkCards.map(({ table, qr_url }) => (
                            <div key={table.id} className="qr-print-page">
                                <QRCardFace tenant={tenant} label="Table" title={table.table_number} qrUrl={qr_url} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
