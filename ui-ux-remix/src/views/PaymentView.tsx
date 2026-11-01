import React, { useState, useEffect } from 'react';
import { useOrder } from '../context/OrderContext';
import { formatRupiah } from '../data/menuData';

export const PaymentView: React.FC = () => {
  const {
    tableNumber,
    activeOrder,
    confirmPayment,
    showToast,
    setIsWaiterModalOpen,
  } = useOrder();

  const [activeMethod, setActiveMethod] = useState<'qris' | 'cash'>('qris');
  const [copied, setCopied] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [totalSeconds, setTotalSeconds] = useState(14 * 60 + 48);

  const initialSeconds = 15 * 60;
  const orderId = activeOrder?.orderId || '#SB-2025-0891';
  const totalAmount = activeOrder ? activeOrder.total : 34000;

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTotalSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const strokeDash = Math.round((totalSeconds / initialSeconds) * 100);

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(totalAmount.toString());
    setCopied(true);
    showToast(`Nominal ${totalAmount} berhasil disalin!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCheckStatus = () => {
    setIsChecking(true);
    setTimeout(() => {
      setIsChecking(false);
      // Auto-validate and forward to order status
      confirmPayment();
    }, 1200);
  };

  return (
    <div className="flex flex-col w-full pb-16">
      {/* Top Meta & Urgent Context Bar */}
      <section className="w-full px-4 md:px-6 pt-6 pb-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 md:p-6 rounded-2xl shadow-md border border-[#D0E2FF]">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#f3f2ff] text-[#003d9b] text-xs font-bold border border-[#dce1ff]">
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                No. Pesanan: {orderId}
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#003d9b] text-white text-xs font-bold">
                <span className="material-symbols-outlined text-[16px]">table_restaurant</span>
                Meja: #{tableNumber} (Dine-in)
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#071747]">Pembayaran Pesanan</h1>
            <p className="text-xs md:text-sm text-[#434654]">
              Selesaikan transaksi agar susu murni &amp; snack segar Anda langsung diproses ke dapur.
            </p>
          </div>

          {/* Live Dynamic Countdown Timer */}
          <div className="flex items-center gap-3 bg-[#f3f2ff] px-4 py-3 rounded-2xl shrink-0 border border-[#dce1ff]">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[#dce1ff]"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                ></path>
                <path
                  className="text-[#bb0016] transition-all duration-1000 ease-linear"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={`${strokeDash}, 100`}
                  strokeLinecap="round"
                  strokeWidth="3"
                ></path>
              </svg>
              <span className="material-symbols-outlined absolute text-[#bb0016] text-[20px]">
                timer
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-[#737685] tracking-wider font-semibold">
                Batas Waktu Bayar
              </span>
              <span className="text-lg md:text-xl text-[#bb0016] font-extrabold font-mono tabular-nums">
                {formattedTime}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Dual Payment Viewport */}
      <section className="w-full px-4 md:px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Payment Mechanism Card */}
          <div className="lg:col-span-8 bg-white rounded-2xl shadow-md border border-[#D0E2FF] p-5 md:p-8 flex flex-col gap-6 relative overflow-hidden">
            {/* Header Total Payment Amount */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#f3f2ff] p-4 md:p-5 rounded-2xl border border-[#dce1ff]">
              <div className="flex flex-col">
                <span className="text-xs text-[#434654] font-medium">Total Tagihan Meja #{tableNumber}</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl md:text-3xl font-extrabold text-[#0052cc] tracking-tight">
                    {formatRupiah(totalAmount)}
                  </span>
                  <span className="text-xs text-[#737685]">(Termasuk PB1 10%)</span>
                </div>
              </div>

              <button
                onClick={handleCopyAmount}
                className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-[#ebedff] text-[#003d9b] px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 self-start sm:self-center border border-[#dce1ff] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
                <span>{copied ? 'Tersalin!' : 'Salin Nominal'}</span>
              </button>
            </div>

            {/* Mode Selector Tabs (QRIS vs Tunai Kasir) */}
            <div className="grid grid-cols-2 gap-1.5 bg-[#f3f2ff] p-1.5 rounded-full border border-[#dce1ff]">
              <button
                onClick={() => setActiveMethod('qris')}
                className={`flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs md:text-sm font-bold transition-all cursor-pointer ${
                  activeMethod === 'qris'
                    ? 'bg-[#0052cc] text-white shadow-sm'
                    : 'text-[#434654] hover:text-[#071747]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                <span>QRIS Instan</span>
              </button>
              <button
                onClick={() => setActiveMethod('cash')}
                className={`flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs md:text-sm font-bold transition-all cursor-pointer ${
                  activeMethod === 'cash'
                    ? 'bg-[#0052cc] text-white shadow-sm'
                    : 'text-[#434654] hover:text-[#071747]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">payments</span>
                <span>Tunai di Kasir</span>
              </button>
            </div>

            {/* VIEW 1: QRIS SCREEN */}
            {activeMethod === 'qris' && (
              <div className="flex flex-col items-center text-center gap-4 animate-in fade-in duration-200">
                {/* QRIS Badge Indicator */}
                <div className="flex items-center justify-between w-full px-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#ebedff] rounded-full text-[#bb0016] text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#bb0016] animate-pulse"></span>
                    QRIS Standar Pembayaran Nasional
                  </div>
                  <span className="text-[11px] text-[#737685] font-mono">NMID: ID102008291029</span>
                </div>

                {/* Central QR Code Wrapper */}
                <div className="relative p-5 bg-white rounded-2xl shadow-md border-2 border-[#D0E2FF] flex flex-col items-center max-w-xs w-full">
                  {/* QR Header Emblem */}
                  <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-[#ebedff]">
                    <div className="flex items-center gap-1 text-[#bb0016] text-sm tracking-tighter">
                      <span className="bg-[#bb0016] text-white px-2 py-0.5 rounded font-black text-xs leading-none">
                        QRIS
                      </span>
                      <span className="text-[10px] text-[#737685] tracking-normal font-semibold">GPN</span>
                    </div>
                    <span className="text-[11px] text-[#003d9b] font-bold">Shi Boss Dine-In</span>
                  </div>

                  {/* Stylized Crisp QR Graphic */}
                  <div className="relative w-56 h-56 sm:w-64 sm:h-64 bg-white p-2 rounded-lg flex items-center justify-center">
                    <svg className="w-full h-full text-[#071747]" fill="currentColor" viewBox="0 0 240 240">
                      {/* Top-Left Finder */}
                      <rect fill="currentColor" height="60" rx="8" width="60" x="10" y="10"></rect>
                      <rect fill="#FFFFFF" height="40" rx="4" width="40" x="20" y="20"></rect>
                      <rect fill="currentColor" height="20" rx="2" width="20" x="30" y="30"></rect>
                      {/* Top-Right Finder */}
                      <rect fill="currentColor" height="60" rx="8" width="60" x="170" y="10"></rect>
                      <rect fill="#FFFFFF" height="40" rx="4" width="40" x="180" y="20"></rect>
                      <rect fill="currentColor" height="20" rx="2" width="20" x="190" y="30"></rect>
                      {/* Bottom-Left Finder */}
                      <rect fill="currentColor" height="60" rx="8" width="60" x="10" y="170"></rect>
                      <rect fill="#FFFFFF" height="40" rx="4" width="40" x="20" y="180"></rect>
                      <rect fill="currentColor" height="20" rx="2" width="20" x="30" y="190"></rect>
                      {/* Density Matrix */}
                      <rect height="10" rx="2" width="10" x="80" y="15"></rect>
                      <rect height="20" rx="2" width="10" x="95" y="15"></rect>
                      <rect height="10" rx="2" width="15" x="115" y="10"></rect>
                      <rect height="10" rx="2" width="15" x="140" y="15"></rect>
                      <rect height="10" rx="2" width="20" x="80" y="35"></rect>
                      <rect height="30" rx="2" width="10" x="110" y="30"></rect>
                      <rect height="10" rx="2" width="20" x="130" y="35"></rect>
                      <rect height="15" rx="2" width="15" x="80" y="55"></rect>
                      <rect height="15" rx="2" width="15" x="145" y="55"></rect>
                      <rect height="10" rx="2" width="20" x="15" y="80"></rect>
                      <rect height="20" rx="2" width="10" x="45" y="80"></rect>
                      <rect height="10" rx="2" width="15" x="65" y="85"></rect>
                      <rect height="25" rx="2" width="15" x="15" y="100"></rect>
                      <rect height="10" rx="2" width="25" x="40" y="110"></rect>
                      <rect height="15" rx="2" width="25" x="15" y="135"></rect>
                      <rect height="20" rx="2" width="20" x="50" y="130"></rect>
                      <rect height="10" rx="2" width="20" x="175" y="85"></rect>
                      <rect height="20" rx="2" width="20" x="205" y="80"></rect>
                      <rect height="25" rx="2" width="10" x="175" y="105"></rect>
                      <rect height="10" rx="2" width="30" x="195" y="110"></rect>
                      <rect height="15" rx="2" width="20" x="180" y="135"></rect>
                      <rect height="25" rx="2" width="15" x="210" y="135"></rect>
                      <rect height="15" rx="2" width="15" x="85" y="85"></rect>
                      <rect height="15" rx="2" width="15" x="140" y="85"></rect>
                      <rect height="15" rx="2" width="15" x="85" y="140"></rect>
                      <rect height="15" rx="2" width="15" x="140" y="140"></rect>
                      <rect height="10" rx="2" width="20" x="80" y="175"></rect>
                      <rect height="25" rx="2" width="15" x="110" y="170"></rect>
                      <rect height="10" rx="2" width="20" x="135" y="180"></rect>
                      <rect height="20" rx="2" width="15" x="80" y="195"></rect>
                      <rect height="15" rx="2" width="30" x="105" y="205"></rect>
                      <rect height="20" rx="2" width="20" x="145" y="200"></rect>
                      <rect height="15" rx="2" width="15" x="175" y="175"></rect>
                      <rect height="10" rx="2" width="25" x="200" y="175"></rect>
                      <rect height="15" rx="2" width="20" x="180" y="200"></rect>
                      <rect height="25" rx="2" width="15" x="210" y="195"></rect>
                    </svg>

                    {/* Central Shi Boss Badge */}
                    <div className="absolute inset-0 m-auto w-12 h-12 bg-white rounded-full p-1 shadow-md flex items-center justify-center">
                      <div className="w-full h-full bg-[#0052cc] rounded-full flex flex-col items-center justify-center text-white">
                        <span className="material-symbols-outlined text-[18px] leading-none">
                          local_cafe
                        </span>
                        <span className="text-[7px] font-extrabold tracking-tight uppercase leading-none mt-0.5">
                          SHI BOSS
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Merchant Identification */}
                  <div className="w-full bg-[#f3f2ff] py-1.5 px-3 rounded-lg mt-2 flex items-center justify-center gap-1.5 border border-[#dce1ff]">
                    <span className="material-symbols-outlined text-[#003d9b] text-[16px]">
                      verified
                    </span>
                    <span className="text-[10px] text-[#003d9b] font-bold uppercase tracking-wider">
                      KEDAI SUSU SEGAR SHI BOSS
                    </span>
                  </div>
                </div>

                {/* Pulsing Status Verification */}
                <div className="w-full flex items-center justify-center gap-2 bg-[#f3f2ff] px-4 py-2.5 rounded-full border border-[#dce1ff]">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#bb0016] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#bb0016]"></span>
                  </span>
                  <span className="text-xs font-semibold text-[#071747]">
                    Menunggu Pembayaran dari Aplikasi Bank/E-Wallet...
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full pt-2">
                  <button
                    onClick={handleCheckStatus}
                    disabled={isChecking}
                    className="w-full sm:flex-1 py-3 px-6 bg-[#0052cc] hover:bg-[#003d9b] text-white rounded-full text-xs md:text-sm font-bold transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        isChecking ? 'animate-spin' : ''
                      }`}
                    >
                      sync
                    </span>
                    <span>{isChecking ? 'Memeriksa ke Bank...' : 'Cek Status / Simulasi Bayar'}</span>
                  </button>

                  <button
                    onClick={() => setActiveMethod('cash')}
                    className="w-full sm:w-auto py-3 px-6 bg-[#ebedff] hover:bg-[#dce1ff] text-[#003d9b] rounded-full text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
                    <span>Bayar Tunai di Kasir</span>
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 2: CASH AT CASHIER SCREEN */}
            {activeMethod === 'cash' && (
              <div className="flex flex-col items-center text-center gap-5 py-2 animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-full bg-[#ebedff] flex items-center justify-center text-[#003d9b]">
                  <span className="material-symbols-outlined text-[36px]">point_of_sale</span>
                </div>

                <div className="flex flex-col items-center max-w-md gap-1">
                  <span className="text-lg font-bold text-[#071747]">
                    Pembayaran Tunai di Kasir
                  </span>
                  <p className="text-xs text-[#434654]">
                    Silakan langsung menuju meja kasir depan untuk pembayaran tunai atau kartu debit fisik.
                  </p>
                </div>

                {/* Printable / Showable Ticket Box */}
                <div className="w-full max-w-md bg-[#f3f2ff] p-5 rounded-2xl flex flex-col gap-2.5 shadow-xs border border-[#dce1ff]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#737685] font-semibold">Kode Antrean Pesanan</span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#dae2ff] text-[#003d9b] font-bold">
                      Dine-In
                    </span>
                  </div>
                  <div className="flex items-center justify-center py-1">
                    <span className="text-2xl md:text-3xl font-extrabold text-[#003d9b] font-mono tracking-wider">
                      {orderId}
                    </span>
                  </div>
                  <div className="w-full bg-[#dce1ff] h-px my-1"></div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#434654]">Nomor Meja:</span>
                    <span className="font-bold text-[#071747]">Meja #{tableNumber}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#434654]">Jumlah Yang Harus Dibayar:</span>
                    <span className="font-bold text-[#bb0016] text-sm">
                      {formatRupiah(totalAmount)}
                    </span>
                  </div>
                </div>

                <div className="w-full max-w-md bg-[#ebedff] p-3.5 rounded-xl flex items-start gap-2 text-left border border-[#dce1ff]">
                  <span className="material-symbols-outlined text-[#bb0016] text-[20px] mt-0.5 shrink-0">
                    info
                  </span>
                  <span className="text-[11px] text-[#434654]">
                    Tunjukkan nomor pesanan di atas ke kasir. Minuman dan hidangan akan segera disajikan ke Meja #{tableNumber} setelah kasir memverifikasi pembayaran Anda.
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 w-full max-w-md">
                  <button
                    onClick={confirmPayment}
                    className="flex-1 py-3 px-6 bg-[#0052cc] hover:bg-[#003d9b] text-white rounded-full text-xs md:text-sm font-bold shadow-md cursor-pointer transition-all"
                  >
                    Konfirmasi Selesai Bayar di Kasir
                  </button>
                  <button
                    onClick={() => setActiveMethod('qris')}
                    className="py-3 px-4 bg-[#f3f2ff] hover:bg-[#ebedff] text-[#003d9b] rounded-full text-xs font-bold transition-all cursor-pointer border border-[#c3c6d6]"
                  >
                    Kembali ke QRIS
                  </button>
                </div>
              </div>
            )}

            {/* Instructional Guide Box */}
            <div className="bg-[#f3f2ff] p-4 rounded-xl flex flex-col gap-2 border border-[#dce1ff] mt-2">
              <div className="flex items-center gap-1.5 font-bold text-xs md:text-sm text-[#071747]">
                <span className="material-symbols-outlined text-[#003d9b] text-[18px]">help</span>
                <span>Panduan Bayar Menggunakan QRIS</span>
              </div>
              <ol className="flex flex-col gap-1 list-decimal list-inside text-xs text-[#434654] leading-relaxed">
                <li>Buka aplikasi e-wallet atau mobile banking Anda (BCA, GoPay, OVO, ShopeePay, DANA, Livin', BRImo).</li>
                <li>Pilih fitur <strong>"Scan QR"</strong> atau <strong>"Bayar"</strong> di aplikasi Anda.</li>
                <li>Arahkan kamera smartphone ke kode QR dinamis di atas.</li>
                <li>Pastikan nama merchant tertera <strong>KEDAI SUSU SEGAR SHI BOSS</strong>.</li>
                <li>Konfirmasi total tagihan tepat <strong>{formatRupiah(totalAmount)}</strong> dan masukkan PIN Anda.</li>
              </ol>
            </div>
          </div>

          {/* Right Column: Order Summary & Dine-in Table Support Assist */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Order Detail Summary Card */}
            <div className="bg-white rounded-2xl shadow-md border border-[#D0E2FF] p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#ebedff]">
                <span className="font-bold text-sm text-[#071747]">Rincian Meja #{tableNumber}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#f3f2ff] text-[#003d9b] text-[11px] font-bold">
                  {activeOrder?.items.length || 3} Menu
                </span>
              </div>

              {/* Product Item Micro-list */}
              <div className="flex flex-col gap-3 max-h-56 overflow-y-auto pr-1">
                {(activeOrder?.items || []).map((ci) => (
                  <div key={ci.cartItemId} className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-lg bg-[#f3f2ff] shrink-0 overflow-hidden">
                      <img
                        src={ci.item.image}
                        alt={ci.item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-bold text-[#071747] truncate">
                        {ci.item.name}
                      </span>
                      <span className="text-[10px] text-[#737685] truncate">
                        {ci.quantity}x • {ci.modifier?.temperature || 'Segar'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#071747] shrink-0">
                      {formatRupiah(ci.unitPrice * ci.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="w-full bg-[#ebedff] h-px"></div>

              {/* Subtotal Breakdown Calculation */}
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between text-[#434654]">
                  <span>Subtotal Item</span>
                  <span>{formatRupiah(activeOrder?.subtotal || 34000)}</span>
                </div>
                <div className="flex justify-between text-[#434654]">
                  <span>Biaya Layanan Meja</span>
                  <span className="text-[#003d9b] font-bold">GRATIS</span>
                </div>
                <div className="flex justify-between text-[#434654]">
                  <span>PB1 (Pajak Resto 10%)</span>
                  <span className="text-[#737685] text-[10px]">Sudah Termasuk</span>
                </div>
                <div className="flex justify-between text-[#071747] font-bold text-sm pt-2 border-t border-[#ebedff]">
                  <span>Total Bersih</span>
                  <span className="text-[#003d9b]">{formatRupiah(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Direct Table Assistance Box */}
            <div className="bg-[#f3f2ff] rounded-2xl p-5 flex flex-col gap-2 border border-[#dce1ff]">
              <div className="flex items-center gap-2 text-[#bb0016] font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">room_service</span>
                <span>Bantuan Pelayan Meja</span>
              </div>
              <p className="text-xs text-[#434654] leading-relaxed">
                Mengalami kendala saat scan QR atau ingin bayar tunai langsung di tempat duduk? Cukup panggil staf pramusaji kami.
              </p>
              <button
                onClick={() => setIsWaiterModalOpen(true)}
                className="mt-2 w-full py-2.5 px-4 bg-white hover:bg-[#ebedff] text-[#bb0016] rounded-full text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 border border-[#ffdad6] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">notifications_active</span>
                <span>Panggil Pelayan ke Meja #{tableNumber}</span>
              </button>
            </div>

            {/* Safe Transaction Security Trust Mark */}
            <div className="flex items-center gap-2 px-1 text-[#737685]">
              <span className="material-symbols-outlined text-[18px]">encrypted</span>
              <span className="text-[10px]">
                Transaksi terlindungi enkripsi QRIS Bank Indonesia &amp; ASPI.
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
