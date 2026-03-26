const {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback
} = React;

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBezCctgmDLW4Kg_3vHUvvobfjCUHZY654",
  authDomain: "dukan360pk-9df7f.firebaseapp.com",
  projectId: "dukan360pk-9df7f",
  storageBucket: "dukan360pk-9df7f.firebasestorage.app",
  messagingSenderId: "1091629212703",
  appId: "1:1091629212703:web:d07df878057a02c838a12a",
  measurementId: "G-2W1VMMQFC3"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence().catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('The current browser does not support all of the features required to enable persistence');
  }
});

// --- GLOBAL AUDIO CONTEXT ---
let globalAudioCtx = null;
const getAudioContext = () => {
  if (!globalAudioCtx) {
    globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume();
  }
  return globalAudioCtx;
};

// --- UTILITIES & HOOKS ---
const useLocalStorage = (key, initialValue) => {
  // Har user ka data uski apni ID ke sath alag alag save hoga
  const userId = auth.currentUser ? auth.currentUser.uid : 'guest';
  const namespacedKey = `${userId}_${key}`;
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(namespacedKey);
      return saved ? JSON.parse(saved) : initialValue;
    } catch (e) {
      return initialValue;
    }
  });

  // Sync with Firestore if logged in
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const docRef = db.collection('users').doc(user.uid).collection('data').doc(key);
    // Listen for real-time updates from Firestore
    const unsubscribe = docRef.onSnapshot(docSnapshot => {
      if (docSnapshot.exists) {
        const source = docSnapshot.metadata.hasPendingWrites ? 'Local' : 'Server';
        // Only update state from server to avoid overwriting pending local writes
        if (source === 'Server') {
          const data = docSnapshot.data().value;
          setState(data);
          localStorage.setItem(namespacedKey, JSON.stringify(data));
        }
      } else {
        // If document doesn't exist on server but we have local data, upload it
        const localData = localStorage.getItem(namespacedKey);
        if (localData) {
          docRef.set({
            value: JSON.parse(localData),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, {
            merge: true
          }).catch(e => console.error(e));
        }
      }
    });
    return () => unsubscribe();
  }, [key, namespacedKey]);
  const setLocalState = useCallback(newValue => {
    setState(prev => {
      const updated = typeof newValue === 'function' ? newValue(prev) : newValue;
      localStorage.setItem(namespacedKey, JSON.stringify(updated));

      // Push to Firestore if logged in
      const user = auth.currentUser;
      if (user) {
        db.collection('users').doc(user.uid).collection('data').doc(key).set({
          value: updated,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, {
          merge: true
        }).catch(err => console.error("Firestore sync error:", err));
      }
      return updated;
    });
  }, [key, namespacedKey]);
  return [state, setLocalState];
};
const formatAmount = num => {
  const parsed = parseFloat(num);
  return isNaN(parsed) ? "0" : Math.round(parsed).toString();
};
const formatPhoneForWA = phone => {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('92')) cleaned = '92' + cleaned;
  return cleaned;
};
const getIsoDate = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const isNearExpiry = expiryDate => {
  if (!expiryDate) return false;
  const exp = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = exp - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 15;
};
const playBeep = () => {
  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    // Real Scanner Sound: Square wave for that sharp digital "beep"
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(2200, context.currentTime); // 2200Hz is a classic scanner pitch

    const now = context.currentTime;
    // Crisp attack and release (short duration)
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.1, now + 0.005); // Very fast attack
    gainNode.gain.linearRampToValueAtTime(0, now + 0.08); // 80ms duration

    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch (e) {
    console.warn("Audio issue:", e);
  }
};
const playClickSound = () => {
  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 1200;
    const now = context.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.4, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
  } catch (e) {
    console.warn("Audio issue:", e);
  }
};
const Icon = ({
  name,
  size = 18,
  className = ""
}) => {
  const iconRef = useRef(null);
  useEffect(() => {
    if (iconRef.current && window.lucide) {
      const iconName = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      iconRef.current.innerHTML = `<i data-lucide="${iconName}" style="width: ${size}px; height: ${size}px;" class="${className}"></i>`;
      window.lucide.createIcons();
    }
  }, [name, size, className]);
  return /*#__PURE__*/React.createElement("span", {
    ref: iconRef,
    className: "inline-flex items-center justify-center"
  });
};
const compressImage = (base64Str, maxWidth = 400) => {
  return new Promise(resolve => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleSize = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
  });
};

// --- BUSINESS CARD COMPONENT ---
const VisitingCard = ({
  id,
  templateIndex,
  shopName,
  ownerName,
  shopPhone,
  shopAddress,
  shopLogo
}) => {
  const templates = ["bg-white border-slate-200 text-slate-800",
  // 1. Minimalist
  "bg-slate-900 text-white border-slate-700" // 2. Professional Dark
  ];
  templates.push("bg-gradient-to-br from-blue-600 to-indigo-800 text-white border-blue-400",
  // 3. Blue Gradient
  "bg-gradient-to-r from-emerald-500 to-teal-700 text-white border-emerald-400",
  // 4. Emerald
  "bg-gradient-to-br from-amber-400 to-orange-600 text-white border-amber-300",
  // 5. Sunset Orange
  "bg-gradient-to-r from-rose-500 to-red-700 text-white border-rose-400",
  // 6. Red Power
  "bg-slate-50 border-blue-500 border-l-[12px] text-slate-800",
  // 7. Corporate Stripe
  "bg-gradient-to-br from-purple-600 to-fuchsia-700 text-white border-purple-400",
  // 8. Modern Purple
  "bg-gradient-to-br from-slate-700 to-slate-900 text-amber-400 border-amber-500",
  // 9. Luxury Gold/Dark
  "bg-white border-green-600 border-t-8 text-slate-800" // 10. Nature White
  );
  const currentStyle = templates[templateIndex] || templates[0];
  return /*#__PURE__*/React.createElement("div", {
    id: id,
    className: `w-full aspect-[1.75/1] rounded-3xl border shadow-xl p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-500 ${currentStyle}`
  }, templateIndex >= 2 && /*#__PURE__*/React.createElement("div", {
    className: "absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"
  }), templateIndex >= 2 && /*#__PURE__*/React.createElement("div", {
    className: "absolute -bottom-10 -left-10 w-40 h-40 bg-black/10 rounded-full blur-2xl"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start relative z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 pr-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black uppercase tracking-tight leading-none break-words mb-1"
  }, shopName || "Apki Dukan"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold opacity-80 uppercase tracking-widest"
  }, ownerName || "Owner Name")), /*#__PURE__*/React.createElement("div", {
    className: "shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 overflow-hidden shadow-lg"
  }, shopLogo ? /*#__PURE__*/React.createElement("img", {
    src: shopLogo,
    className: "w-full h-full object-cover"
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "Store",
    size: 28
  })))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5 relative z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 opacity-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Phone",
    size: 12
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-bold tracking-wider"
  }, shopPhone || "03XX-XXXXXXX")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-2 opacity-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "MapPin",
    size: 12,
    className: "mt-0.5 shrink-0"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-medium leading-tight break-words"
  }, shopAddress || "Store Address, City Name")), /*#__PURE__*/React.createElement("div", {
    className: "pt-2 flex justify-between items-center border-t border-current/20 mt-1"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[8px] font-black uppercase tracking-[0.3em] opacity-60"
  }, "Digital Business Card"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[7px] font-bold opacity-50 uppercase"
  }, "Powered by"), /*#__PURE__*/React.createElement("span", {
    className: "text-[8px] font-black tracking-tighter italic"
  }, "Dukan360")))));
};
const BusinessCardCarousel = ({
  shopName,
  ownerName,
  shopPhone,
  shopAddress,
  shopLogo,
  currentIndex,
  setCurrentIndex
}) => {
  // Internal state removed, now using props for persistence
  const [isSharing, setIsSharing] = useState(false);
  const cardRefPrefix = "v-card-ref-";
  const shareCard = async () => {
    const element = document.getElementById(`${cardRefPrefix}${currentIndex}`);
    if (!element) return;
    setIsSharing(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        borderRadius: 24
      });
      canvas.toBlob(async blob => {
        const file = new File([blob], `BusinessCard-${shopName}.png`, {
          type: 'image/png'
        });
        if (navigator.canShare && navigator.canShare({
          files: [file]
        })) {
          try {
            await navigator.share({
              title: `${shopName} Business Card`,
              text: `Check out my business card!`,
              files: [file]
            });
          } catch (err) {
            console.warn("Share failed", err);
          }
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `BusinessCard-${shopName}.png`;
          a.click();
        }
        setIsSharing(false);
      });
    } catch (e) {
      console.error("Card capture failed", e);
      setIsSharing(false);
    }
  };
  const next = () => setCurrentIndex(prev => (prev + 1) % 10);
  const prev = () => setCurrentIndex(prev => (prev - 1 + 10) % 10);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative group"
  }, /*#__PURE__*/React.createElement(VisitingCard, {
    id: `${cardRefPrefix}${currentIndex}`,
    templateIndex: currentIndex,
    shopName: shopName,
    ownerName: ownerName,
    shopPhone: shopPhone,
    shopAddress: shopAddress,
    shopLogo: shopLogo
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-y-0 -left-2 -right-2 flex justify-between items-center pointer-events-none"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: prev,
    className: "w-8 h-8 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-slate-800 pointer-events-auto active:scale-90 border transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronLeft",
    size: 20
  })), /*#__PURE__*/React.createElement("button", {
    onClick: next,
    className: "w-8 h-8 bg-white/90 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-slate-800 pointer-events-auto active:scale-90 border transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronRight",
    size: 20
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center px-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1"
  }, [...Array(10)].map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `h-1.5 rounded-full transition-all duration-300 ${currentIndex === i ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-300'}`
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: shareCard,
    disabled: isSharing,
    className: `flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg border-b-4 ${isSharing ? 'bg-slate-300 border-slate-400' : 'bg-emerald-600 border-emerald-800 text-white'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: isSharing ? "Loader2" : "Share2",
    size: 16,
    className: isSharing ? "animate-spin" : ""
  }), isSharing ? 'Processing' : 'Share Card')), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest italic"
  }, "Swipe left/right to change design"));
};

// --- WHATSAPP HELPER ---
const sendWAInvoice = (tx, shopName, shopPhone, shopAddress, phoneNumber) => {
  if (!phoneNumber) return;
  const cleanedNum = formatPhoneForWA(phoneNumber);
  const itemsString = tx.items.map((item, idx) => `${idx + 1}. *${item.name}*\n   ${item.quantity} x ${formatAmount(item.priceUsed)} = Rs.${formatAmount(item.quantity * item.priceUsed)}`).join('\n\n');
  const subtotalLine = tx.discountAmount > 0 ? `Subtotal: Rs.${formatAmount(tx.subtotal)}\n` : '';
  const discountLine = tx.discountAmount > 0 ? `Discount: -Rs.${formatAmount(tx.discountAmount)}\n` : '';
  const netAmount = tx.amount;
  const paidAmount = tx.paidAmount || 0;
  const balanceAmount = netAmount - paidAmount;
  let paymentTafseel = '';
  if (paidAmount < netAmount) {
    paymentTafseel = `--------------------------------\nPaid: Rs.${formatAmount(paidAmount)}\n*Remaining: Rs.${formatAmount(balanceAmount)}*\n`;
  } else if (tx.paymentType === 'Cash') {
    paymentTafseel = `Status: *Full Paid (Cash)*\n`;
  }
  const addressLine = shopAddress ? `ðŸ“ ${shopAddress}\n` : '';
  const phoneLine = shopPhone ? `ðŸ“ž ${shopPhone}\n` : '';
  const rawMsg = `*${shopName.toUpperCase()}*\n${addressLine}${phoneLine}--------------------------------\n*INVOICE DETAILS*\n--------------------------------\n*Inv No:* ${tx.id}\n*Date:* ${tx.date} | ${tx.time}\n*Customer:* ${tx.contactName}\n--------------------------------\n${itemsString}\n--------------------------------\n${subtotalLine}${discountLine}*TOTAL BILL: Rs.${formatAmount(netAmount)}*\n${paymentTafseel}--------------------------------\n_Shukriya! Phir zaroor aayein._\n\n_Powered by Dukan360_`;
  const encodedMsg = encodeURIComponent(rawMsg);
  window.open(`https://wa.me/${cleanedNum}?text=${encodedMsg}`, '_blank');
};
const shareInvoiceAsImage = async (tx, shopName) => {
  const element = document.getElementById('printable-invoice');
  if (!element) return;
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff'
    });
    canvas.toBlob(async blob => {
      const file = new File([blob], `Invoice-${tx.id}.png`, {
        type: 'image/png'
      });
      if (navigator.canShare && navigator.canShare({
        files: [file]
      })) {
        try {
          await navigator.share({
            title: `${shopName} Invoice`,
            text: `Invoice #${tx.id} from ${shopName}`,
            files: [file]
          });
        } catch (err) {
          console.warn("Share failed", err);
        }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Invoice-${tx.id}.png`;
        a.click();
      }
    });
  } catch (e) {
    console.error("Image generation failed", e);
  }
};
const generatePDFStatement = (contact, transactions, shopName) => {
  if (!window.jspdf) return alert("PDF generator not loaded");
  const {
    jsPDF
  } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(shopName || "Business Statement", 14, 15);
  doc.setFontSize(10);
  doc.text(`Contact: ${contact.name} (${contact.phone})`, 14, 22);
  doc.text(`Date: ${getIsoDate()}`, 14, 27);
  const rows = transactions.map(t => [`${t.date}\n${t.time}`, t.type.toUpperCase(), t.description || (t.items ? `${t.items.length} Items` : '-'), t.type === 'sale' || t.type === 'payment' ? formatAmount(t.amount) : '-', t.type === 'purchase' || t.type === 'receipt' ? formatAmount(t.amount) : '-']);
  doc.autoTable({
    startY: 32,
    head: [['Date', 'Type', 'Description', 'Debit (Dr)', 'Credit (Cr)']],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8
    },
    headStyles: {
      fillColor: [22, 163, 74]
    }
  });
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text(`Net Balance: Rs. ${formatAmount(contact.balance)} ${contact.balance < 0 ? '(Receivable)' : '(Payable)'}`, 14, finalY);
  doc.save(`${contact.name}_Statement.pdf`);
};

// --- SUB-COMPONENTS ---

const PerformanceSection = ({
  transactions,
  products,
  categories,
  isRomanUrdu,
  onBack
}) => {
  const [pFilter, setPFilter] = useState('all');
  const [pCustomStart, setPCustomStart] = useState(getIsoDate());
  const [pCustomEnd, setPCustomEnd] = useState(getIsoDate());
  const [showAllSelling, setShowAllSelling] = useState(false);
  const [showAllProfitable, setShowAllProfitable] = useState(false);
  const stats = useMemo(() => {
    const today = getIsoDate();
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterday = getIsoDate(yesterdayObj);
    const currentMonth = today.substring(0, 7);
    const lastMonthObj = new Date();
    lastMonthObj.setMonth(lastMonthObj.getMonth() - 1);
    const lastMonth = lastMonthObj.toISOString().substring(0, 7);
    const currentYear = today.substring(0, 4);
    const filteredTransactions = transactions.filter(t => {
      if (pFilter === 'today') return t.date === today;
      if (pFilter === 'yesterday') return t.date === yesterday;
      if (pFilter === 'thisMonth') return t.date.startsWith(currentMonth);
      if (pFilter === 'lastMonth') return t.date.startsWith(lastMonth);
      if (pFilter === 'thisYear') return t.date.startsWith(currentYear);
      if (pFilter === 'custom') return t.date >= pCustomStart && t.date <= pCustomEnd;
      return true;
    });
    const sales = filteredTransactions.filter(t => t.type === 'sale');
    const saleReturns = filteredTransactions.filter(t => t.type === 'sale_return');
    const productMap = {};
    const categoryMap = {};
    products.forEach(p => {
      productMap[p.id] = {
        name: p.name,
        totalQty: 0,
        totalRevenue: 0,
        totalProfit: 0,
        categoryId: p.categoryId,
        image: p.image
      };
    });
    categories.forEach(c => {
      categoryMap[c.id] = {
        name: c.name,
        totalRevenue: 0,
        totalProfit: 0
      };
    });
    categoryMap['all'] = {
      name: 'General',
      totalRevenue: 0,
      totalProfit: 0
    };
    sales.forEach(tx => {
      (tx.items || []).forEach(item => {
        if (productMap[item.id]) {
          const qty = parseFloat(item.quantity) || 0;
          const rev = (parseFloat(item.priceUsed) || 0) * qty;
          const cost = (parseFloat(item.costUsedForProfit) || 0) * qty;
          const prof = rev - cost;
          productMap[item.id].totalQty += qty;
          productMap[item.id].totalRevenue += rev;
          productMap[item.id].totalProfit += prof;
          const catId = productMap[item.id].categoryId || 'all';
          if (categoryMap[catId]) {
            categoryMap[catId].totalRevenue += rev;
            categoryMap[catId].totalProfit += prof;
          }
        }
      });
    });
    saleReturns.forEach(tx => {
      (tx.items || []).forEach(item => {
        if (productMap[item.id]) {
          const qty = parseFloat(item.quantity) || 0;
          const rev = (parseFloat(item.priceUsed) || 0) * qty;
          const cost = (parseFloat(item.costUsedForProfit) || 0) * qty;
          const prof = rev - cost;
          productMap[item.id].totalQty -= qty;
          productMap[item.id].totalRevenue -= rev;
          productMap[item.id].totalProfit -= prof;
          const catId = productMap[item.id].categoryId || 'all';
          if (categoryMap[catId]) {
            categoryMap[catId].totalRevenue -= rev;
            categoryMap[catId].totalProfit -= prof;
          }
        }
      });
    });
    const productList = Object.values(productMap);
    const categoryList = Object.values(categoryMap).filter(c => c.totalRevenue > 0);
    return {
      topSelling: [...productList].sort((a, b) => b.totalQty - a.totalQty).filter(i => i.totalRevenue > 0),
      topProfitable: [...productList].sort((a, b) => b.totalProfit - a.totalProfit).filter(i => i.totalRevenue > 0),
      bestCategories: [...categoryList].sort((a, b) => b.totalRevenue - a.totalRevenue),
      totalRev: productList.reduce((a, b) => a + b.totalRevenue, 0),
      totalProf: productList.reduce((a, b) => a + b.totalProfit, 0)
    };
  }, [transactions, products, categories, pFilter, pCustomStart, pCustomEnd]);
  const StatCard = ({
    title,
    items,
    colorClass,
    romanUrdu,
    showAll,
    onToggle
  }) => {
    const displayedItems = showAll ? items : items.slice(0, 3);
    return /*#__PURE__*/React.createElement("div", {
      className: "bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col mb-4 transition-all duration-300"
    }, /*#__PURE__*/React.createElement("div", {
      className: `p-4 ${colorClass} text-white flex justify-between items-center`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-1"
    }, /*#__PURE__*/React.createElement("h4", {
      className: "font-black text-xs uppercase tracking-widest"
    }, title), isRomanUrdu && /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] opacity-80 font-bold uppercase tracking-tight"
    }, romanUrdu)), items.length > 3 && /*#__PURE__*/React.createElement("button", {
      onClick: onToggle,
      className: "bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-90"
    }, showAll ? 'Show Less' : 'See All')), /*#__PURE__*/React.createElement("div", {
      className: "p-2 divide-y divide-slate-50"
    }, displayedItems.map((item, idx) => /*#__PURE__*/React.createElement("div", {
      key: idx,
      className: "p-3 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-right duration-300"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3 min-w-0"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-black text-slate-300 w-4"
    }, "#", idx + 1), /*#__PURE__*/React.createElement("div", {
      className: "w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden"
    }, item.image ? /*#__PURE__*/React.createElement("img", {
      src: item.image,
      className: "w-full h-full object-cover"
    }) : /*#__PURE__*/React.createElement(Icon, {
      name: "Package",
      size: 14,
      className: "text-slate-300"
    })), /*#__PURE__*/React.createElement("div", {
      className: "min-w-0"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-xs font-bold text-slate-700 truncate"
    }, item.name), /*#__PURE__*/React.createElement("p", {
      className: "text-[9px] font-black text-slate-400 uppercase tracking-tighter"
    }, "Qty: ", Math.round(item.totalQty), " Sold"))), /*#__PURE__*/React.createElement("div", {
      className: "text-right shrink-0"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-black text-slate-900 leading-tight"
    }, "Sale: Rs.", formatAmount(item.totalRevenue)), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-black text-green-600 leading-tight"
    }, "Profit: Rs.", formatAmount(item.totalProfit))))), items.length === 0 && /*#__PURE__*/React.createElement("p", {
      className: "p-10 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest"
    }, "No Sales in Selected Period")), items.length > 3 && !showAll && /*#__PURE__*/React.createElement("button", {
      onClick: onToggle,
      className: "p-3 text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-50 border-t"
    }, "+ ", items.length - 3, " More Items / Mazeed Dekhein"));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col bg-slate-50 pb-32"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-white border-b flex flex-col gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    className: "p-2 bg-slate-50 rounded-full active:scale-90 border shadow-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ArrowLeft"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "text-lg font-black text-slate-800 uppercase tracking-tight"
  }, "Performance Hub"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-blue-600 uppercase tracking-widest"
  }, "Full Product Analytics")))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 overflow-x-auto no-scrollbar pb-1"
  }, [{
    id: 'all',
    label: 'All Time'
  }, {
    id: 'today',
    label: 'Today'
  }, {
    id: 'yesterday',
    label: 'Yesterday'
  }, {
    id: 'thisMonth',
    label: 'This Month'
  }, {
    id: 'lastMonth',
    label: 'Last Month'
  }, {
    id: 'thisYear',
    label: 'This Year'
  }, {
    id: 'custom',
    label: 'Custom'
  }].map(f => /*#__PURE__*/React.createElement("button", {
    key: f.id,
    onClick: () => {
      setPFilter(f.id);
      setShowAllSelling(false);
      setShowAllProfitable(false);
    },
    className: `px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${pFilter === f.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-100 text-slate-500 border-slate-200'}`
  }, f.label))), pFilter === 'custom' && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-2 bg-blue-50 p-3 rounded-2xl border border-blue-100 animate-in slide-in-from-top duration-300"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-blue-400 uppercase ml-1"
  }, "From"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: pCustomStart,
    onChange: e => setPCustomStart(e.target.value),
    className: "w-full bg-white border border-blue-100 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-blue-400 uppercase ml-1"
  }, "To"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: pCustomEnd,
    onChange: e => setPCustomEnd(e.target.value),
    className: "w-full bg-white border border-blue-100 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 space-y-2 no-scrollbar"
  }, /*#__PURE__*/React.createElement(StatCard, {
    title: "Most Selling Items",
    items: stats.topSelling,
    colorClass: "bg-blue-600",
    romanUrdu: "Sab se zyada biknay wala maal",
    showAll: showAllSelling,
    onToggle: () => setShowAllSelling(!showAllSelling)
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "Most Profitable Items",
    items: stats.topProfitable,
    colorClass: "bg-emerald-600",
    romanUrdu: "Sab se zyada munafa denay wala maal",
    showAll: showAllProfitable,
    onToggle: () => setShowAllProfitable(!showAllProfitable)
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-orange-500 text-white"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-xs uppercase tracking-widest"
  }, "Categories Performance"), isRomanUrdu && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] opacity-80 font-bold uppercase tracking-tight"
  }, "Categories ka hisaab kitab")), /*#__PURE__*/React.createElement("div", {
    className: "p-2 divide-y divide-slate-50"
  }, stats.bestCategories.map((cat, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    className: "p-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "min-w-0 pr-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-black text-slate-800 uppercase tracking-tight truncate"
  }, cat.name), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4 mt-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 uppercase"
  }, "Sale: ", /*#__PURE__*/React.createElement("span", {
    className: "text-slate-900"
  }, "Rs.", formatAmount(cat.totalRevenue))), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 uppercase"
  }, "Profit: ", /*#__PURE__*/React.createElement("span", {
    className: "text-green-600"
  }, "Rs.", formatAmount(cat.totalProfit))))), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-black text-orange-500 uppercase tracking-widest"
  }, (cat.totalRevenue / (stats.totalRev || 1) * 100).toFixed(1), "%"), /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-bold text-slate-300 uppercase leading-none"
  }, "Share"))), /*#__PURE__*/React.createElement("div", {
    className: "h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full bg-orange-400 rounded-full transition-all duration-1000",
    style: {
      width: `${cat.totalRevenue / (stats.totalRev || 1) * 100}%`
    }
  })))))), /*#__PURE__*/React.createElement("div", {
    className: "p-10 text-center opacity-30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trophy",
    size: 48,
    className: "mx-auto mb-2"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black uppercase tracking-[0.3em]"
  }, "End of Performance Report"))));
};
const CategoryManagerModal = ({
  categories,
  setCategories,
  onClose
}) => {
  const [newCat, setNewCat] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const handleAdd = () => {
    if (!newCat.trim()) return;
    setCategories([...categories, {
      id: String(Date.now()),
      name: newCat.trim()
    }]);
    setNewCat("");
  };
  const handleDelete = id => {
    if (window.confirm("Yeh category delete karne se products delete nahi honge magar unka filter hat jayega. Delete karein?")) {
      setCategories(categories.filter(c => c.id !== id));
    }
  };
  const startEdit = cat => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };
  const saveEdit = () => {
    if (!editName.trim()) return;
    setCategories(categories.map(c => c.id === editingId ? {
      ...c,
      name: editName.trim()
    } : c));
    setEditingId(null);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[600] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl overflow-hidden flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in duration-300 text-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-slate-50 border-b flex justify-between items-center shrink-0"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-slate-800 text-sm"
  }, "Categories Sambhalein"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "p-2 bg-white rounded-full shadow-sm active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 border-b shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: newCat || "",
    onChange: e => setNewCat(e.target.value),
    placeholder: "Nayi Category ka Naam...",
    className: "flex-1 bg-slate-50 border p-3 rounded-xl outline-none text-sm font-bold"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleAdd,
    className: "bg-blue-600 text-white px-4 rounded-xl active:scale-90 shadow-md"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar"
  }, categories.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "text-center text-slate-400 text-xs font-bold py-10 uppercase tracking-widest"
  }, "Koi category nahi mili") : categories.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    className: "bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between"
  }, editingId === c.id ? /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    value: editName || "",
    onChange: e => setEditName(e.target.value),
    className: "flex-1 bg-white border p-1 rounded px-2 text-sm font-bold outline-blue-400"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: saveEdit,
    className: "text-green-600"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Check"
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditingId(null),
    className: "text-slate-400"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-slate-700 text-sm"
  }, c.name), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => startEdit(c),
    className: "text-blue-400 p-1 active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Pencil",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleDelete(c.id),
    className: "text-red-400 p-1 active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trash2",
    size: 14
  })))))))));
};
const HighSpeedScannerPopup = ({
  onScan,
  onClose,
  scannerId,
  cart = [],
  cartTotal = 0,
  showCheckout = false
}) => {
  const scannerInstance = useRef(null);
  const lastCode = useRef("");
  const lockTime = useRef(0);
  const [flash, setFlash] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // FIX: Use ref for onScan to prevent scanner restart on every scan (keeping torch alive)
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  const handleScanResult = useCallback(text => {
    const now = Date.now();
    if (text === lastCode.current && now < lockTime.current) return;
    lastCode.current = text;
    lockTime.current = now + 800; // Lock time
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
    playBeep();
    if (onScanRef.current) onScanRef.current(text);
  }, []);
  useEffect(() => {
    const html5QrCode = new window.Html5Qrcode(scannerId);
    scannerInstance.current = html5QrCode;
    const start = async () => {
      try {
        const config = {
          fps: 60,
          // Full screen scanning logic
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            return {
              width: viewfinderWidth * 0.95,
              // Scan 95% of width
              height: viewfinderHeight * 0.95 // Scan 95% of height
            };
          },
          aspectRatio: undefined,
          disableFlip: false,
          videoConstraints: {
            focusMode: "continuous",
            // Try to force auto-focus
            facingMode: "environment"
          }
        };
        try {
          await html5QrCode.start({
            facingMode: "environment"
          }, config, handleScanResult);
        } catch (err) {
          await html5QrCode.start({
            facingMode: "user"
          }, config, handleScanResult);
        }
      } catch (err) {
        setErrorMessage("Camera access failed.");
      }
    };
    start();
    return () => {
      if (scannerInstance.current && scannerInstance.current.isScanning) {
        scannerInstance.current.stop().catch(e => console.log(e));
      }
    };
  }, [scannerId, handleScanResult]);
  const toggleTorch = () => {
    if (scannerInstance.current) {
      const newMode = !torchOn;
      scannerInstance.current.applyVideoConstraints({
        advanced: [{
          torch: newMode
        }]
      }).then(() => setTorchOn(newMode)).catch(err => {
        console.warn("Torch toggle failed", err);
        alert("Torch control not supported on this device/browser.");
      });
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[400] bg-black flex items-center justify-center animate-in fade-in duration-300"
  }, /*#__PURE__*/React.createElement("div", {
    className: `bg-black w-full h-full flex flex-col relative`
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/40 to-transparent"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "p-2 bg-white/10 backdrop-blur-md rounded-full text-white active:scale-90 border border-white/20 shadow-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ArrowLeft",
    size: 24
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: toggleTorch,
    className: `p-3 rounded-full backdrop-blur-md border active:scale-90 transition-all ${torchOn ? 'bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-white/10 text-white border-white/20'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: torchOn ? "Zap" : "ZapOff",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    className: `relative flex-1 bg-black overflow-hidden ${flash ? 'scan-success-flash' : ''}`
  }, errorMessage ? /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "CameraOff",
    size: 48,
    className: "text-slate-500 mb-4"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400 text-xs font-bold leading-relaxed"
  }, errorMessage)) : /*#__PURE__*/React.createElement("div", {
    id: scannerId,
    className: "scanner-container w-full h-full absolute inset-0"
  }), !errorMessage && /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 pointer-events-none flex flex-col items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-64 h-48 relative opacity-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-lg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute top-1/2 left-4 right-4 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"
  })), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-12 text-white/70 text-[10px] font-bold uppercase tracking-widest bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm"
  }, "Scanning Full Screen")), flash && /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-[1px] z-30"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white/90 p-4 rounded-full shadow-2xl scale-110 transition-transform"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Check",
    size: 40,
    className: "text-green-600"
  })))), showCheckout && /*#__PURE__*/React.createElement("div", {
    className: "h-1/3 flex flex-col bg-slate-900 border-t border-slate-800 shrink-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-5 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center shrink-0"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]"
  }, "Recently Scanned"), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-blue-400"
  }, cart.length, " Items")), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar p-2"
  }, cart.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "h-full flex flex-col items-center justify-center opacity-30 text-white"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ShoppingCart",
    size: 32
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold mt-2 uppercase tracking-widest text-center"
  }, "Scan items to add")) : [...cart].reverse().map((item, idx) => /*#__PURE__*/React.createElement("div", {
    key: `${item.id}-${idx}`,
    className: "bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center animate-in slide-in-from-right duration-300"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0 pr-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-slate-200 truncate"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-500 font-bold uppercase"
  }, "Qty: ", item.quantity, " \xE2\u20AC\xA2 Rs. ", formatAmount(item.priceUsed))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-black text-green-400"
  }, "Rs. ", formatAmount(item.priceUsed * item.quantity))))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-slate-950 text-white shrink-0 flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-bold text-slate-500 uppercase tracking-widest"
  }, "Total Bill"), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-black text-white"
  }, "Rs. ", formatAmount(cartTotal))), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-bold uppercase shadow-[0_0_15px_rgba(22,163,74,0.4)] active:scale-95 transition-all"
  }, "Done")))));
};
const BillPreviewModal = ({
  tx,
  shopName,
  shopPhone,
  shopAddress,
  shopLogo,
  paymentDetails,
  paymentQR,
  billWidth,
  onClose
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  if (!tx) return null;
  const handleShare = async () => {
    setIsCapturing(true);
    await shareInvoiceAsImage(tx, shopName);
    setIsCapturing(false);
  };
  const getTypeLabel = type => {
    switch (type) {
      case 'sale':
        return 'SALES INVOICE';
      case 'purchase':
        return 'PURCHASE VOUCHER';
      case 'receipt':
        return 'RECOVERY RECEIPT';
      case 'payment':
        return 'PAYMENT VOUCHER';
      case 'sale_return':
        return 'SALE RETURN';
      case 'purchase_return':
        return 'PURCHASE RETURN';
      default:
        return 'TRANSACTION';
    }
  };
  const subtotal = tx.subtotal || tx.amount;
  const discount = tx.discountAmount || 0;
  const netAmount = tx.amount;
  const paid = tx.paidAmount || 0;
  const balanceDue = Math.max(0, netAmount - paid);
  const is58mm = billWidth === '58mm';
  const containerStyle = {
    width: is58mm ? '58mm' : '75mm',
    // Using slightly less than 80mm for safe margins
    padding: '10px',
    margin: '0 auto',
    backgroundColor: 'white',
    fontSize: is58mm ? '10px' : '12px'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 print-modal"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl print-scroll-fix"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-slate-50 border-b flex justify-between items-center print-hide"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-slate-800 text-sm"
  }, "Invoice Preview (", billWidth, ")"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "p-2 bg-white rounded-full shadow-sm active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto bg-slate-200 p-4 no-scrollbar text-center print-scroll-fix"
  }, /*#__PURE__*/React.createElement("div", {
    id: "printable-invoice",
    style: containerStyle,
    className: "font-mono shadow-lg rounded-sm space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-1"
  }, shopLogo && /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center mb-2"
  }, /*#__PURE__*/React.createElement("img", {
    src: shopLogo,
    className: "h-16 w-16 rounded-full object-cover"
  })), /*#__PURE__*/React.createElement("h4", {
    className: "text-lg font-bold uppercase"
  }, shopName), shopAddress && /*#__PURE__*/React.createElement("p", {
    className: `text-slate-500 leading-tight ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, shopAddress), shopPhone && /*#__PURE__*/React.createElement("p", {
    className: `text-slate-500 ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, "Contact: ", shopPhone), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 py-1 bg-slate-100 rounded-lg"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-black tracking-[0.2em]"
  }, getTypeLabel(tx.type)))), /*#__PURE__*/React.createElement("div", {
    className: `flex justify-between items-start ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-left"
  }, /*#__PURE__*/React.createElement("span", null, "INV#: ", tx.id), tx.paymentType === 'Credit' && tx.contactName && /*#__PURE__*/React.createElement("div", {
    className: "font-bold mt-1 text-slate-800 tracking-tight"
  }, "Name: ", tx.contactName)), /*#__PURE__*/React.createElement("div", {
    className: "text-right leading-tight"
  }, /*#__PURE__*/React.createElement("span", null, tx.date), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", null, tx.time))), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-dashed"
  }), tx.items && tx.items.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, tx.items.map((item, idx) => /*#__PURE__*/React.createElement("div", {
    key: idx,
    className: "flex justify-between items-start text-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 pr-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-bold"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: `text-slate-500 ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, item.quantity, " x ", formatAmount(item.priceUsed))), /*#__PURE__*/React.createElement("p", {
    className: "font-bold"
  }, "Rs. ", formatAmount(item.quantity * item.priceUsed))))), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-dashed"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, discount > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: `flex justify-between font-bold ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, /*#__PURE__*/React.createElement("span", null, "SUBTOTAL"), /*#__PURE__*/React.createElement("span", null, "Rs. ", formatAmount(subtotal))), /*#__PURE__*/React.createElement("div", {
    className: `flex justify-between font-bold text-red-600 ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, /*#__PURE__*/React.createElement("span", null, "DISCOUNT ", tx.discountType === 'percent' ? `(${tx.discountValue}%)` : ''), /*#__PURE__*/React.createElement("span", null, "- Rs. ", formatAmount(discount)))), /*#__PURE__*/React.createElement("div", {
    className: `flex justify-between font-bold ${is58mm ? 'text-[11px]' : 'text-lg'}`
  }, /*#__PURE__*/React.createElement("span", null, "TOTAL BILL"), /*#__PURE__*/React.createElement("span", null, "Rs. ", formatAmount(netAmount))), tx.paymentType === 'Credit' && /*#__PURE__*/React.createElement("div", {
    className: "pt-2 border-t border-dotted mt-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: `flex justify-between font-bold text-blue-700 ${is58mm ? 'text-[9px]' : 'text-[10px]'}`
  }, /*#__PURE__*/React.createElement("span", null, tx.type.includes('return') ? 'REFUNDED (WAPIS KIYE)' : 'PAID (ADA SHUDA)'), /*#__PURE__*/React.createElement("span", null, "Rs. ", formatAmount(paid))), balanceDue > 0 && /*#__PURE__*/React.createElement("div", {
    className: `flex justify-between font-black text-red-600 mt-1 bg-red-50 p-1 rounded ${is58mm ? 'text-[10px]' : 'text-xs'}`
  }, /*#__PURE__*/React.createElement("span", null, "BALANCE (BAQAYA)"), /*#__PURE__*/React.createElement("span", null, "Rs. ", formatAmount(balanceDue))))), tx.description && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 p-2 bg-slate-50 border border-dashed border-slate-300 rounded text-left"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1"
  }, "Transaction Note"), /*#__PURE__*/React.createElement("p", {
    className: `font-bold text-slate-700 italic ${is58mm ? 'text-[10px]' : 'text-[11px]'}`
  }, tx.description)), tx.type === 'sale' && (paymentDetails || paymentQR) && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 pt-4 border-t border-dashed text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2"
  }, "Payment Information"), paymentDetails && /*#__PURE__*/React.createElement("p", {
    className: `font-bold text-slate-700 mb-3 whitespace-pre-line leading-relaxed ${is58mm ? 'text-[10px]' : 'text-[11px]'}`
  }, paymentDetails), paymentQR && /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center"
  }, /*#__PURE__*/React.createElement("img", {
    src: paymentQR,
    className: "w-24 h-24 border-2 border-slate-100 rounded-lg p-1"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-black text-slate-400 mt-1 uppercase"
  }, "Scan to Pay"))), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-dashed pt-4 text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-black text-slate-400 mt-3"
  }, "( Powered by Dukan360 )")))), /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-slate-50 border-t flex gap-2 print-hide"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => window.print(),
    className: "flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-xs"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Printer",
    size: 16
  }), " Print"), /*#__PURE__*/React.createElement("button", {
    onClick: handleShare,
    disabled: isCapturing,
    className: "flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-xs"
  }, isCapturing ? 'Processing...' : 'Share Bill'))));
};
const SuccessAnimation = () => {
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-3xl p-8 flex flex-col items-center shadow-2xl animate-in zoom-in duration-300 transform scale-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-24 h-24 bg-green-100/50 rounded-full flex items-center justify-center mb-4 ring-8 ring-green-50"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Check",
    size: 48,
    className: "text-green-600"
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-slate-800 uppercase tracking-widest"
  }, "Saved!"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1"
  }, "Transaction Complete")));
};
const Dashboard = ({
  statsGroups,
  ownerName,
  currentFilter,
  setFilter,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  transactions,
  onEdit,
  onDelete,
  onViewBill,
  onStatClick,
  isRomanUrduEnabled,
  onAddExpense,
  subscription,
  isSubscriptionActive,
  daysLeft,
  isPrinterConnected,
  isInvoicePreviewEnabled,
  productsList
}) => {
  const filterLabel = {
    today: 'Today',
    yesterday: 'Yesterday',
    month: 'This Month',
    custom: 'Range'
  }[currentFilter] || 'Current';
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [isClearNotifModalOpen, setIsClearNotifModalOpen] = useState(false);
  const [visibleTxCount, setVisibleTxCount] = useState(10);

  // --- NEW STATES FOR RECENT ACTIVITY SEARCH & FILTERS ---
  const [activitySearch, setActivitySearch] = useState("");
  const [activityDateFilter, setActivityDateFilter] = useState("all");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const [activityCustomStart, setActivityCustomStart] = useState(getIsoDate());
  const [activityCustomEnd, setActivityCustomEnd] = useState(getIsoDate());
  const dashFilterRef = useRef(null);
  const notifMenuRef = useRef(null);
  const [clearedAlertIds, setClearedAlertIds] = useLocalStorage('gs_v4_cleared_alert_ids', []);
  const [seenAlertIds, setSeenAlertIds] = useLocalStorage('gs_v4_seen_alert_ids', []);
  const allAlerts = useMemo(() => {
    if (!productsList) return [];
    const alerts = [];
    productsList.forEach(p => {
      if (p.openingStock <= 0) {
        alerts.push({
          id: `oos_${p.id}_${p.openingStock}`,
          type: 'oos',
          name: p.name,
          msg: 'Out of stock'
        });
      } else if (p.openingStock <= (p.minStock || 0)) {
        alerts.push({
          id: `low_${p.id}_${p.openingStock}`,
          type: 'low',
          name: p.name,
          msg: `Low stock (${p.openingStock} left)`
        });
      }
      if (isNearExpiry(p.expiryDate)) {
        alerts.push({
          id: `exp_${p.id}_${p.expiryDate}`,
          type: 'exp',
          name: p.name,
          msg: `Expiring soon (${p.expiryDate})`
        });
      }
    });
    return alerts;
  }, [productsList]);
  const visibleAlerts = useMemo(() => {
    return allAlerts.filter(a => !clearedAlertIds.includes(a.id));
  }, [allAlerts, clearedAlertIds]);
  const unreadCount = useMemo(() => {
    return visibleAlerts.filter(a => !seenAlertIds.includes(a.id)).length;
  }, [visibleAlerts, seenAlertIds]);
  const latestVisibleAlerts = useRef(visibleAlerts);
  useEffect(() => {
    latestVisibleAlerts.current = visibleAlerts;
  }, [visibleAlerts]);
  const wasNotifMenuOpen = useRef(false);
  useEffect(() => {
    if (showNotifMenu) {
      wasNotifMenuOpen.current = true;
    } else if (wasNotifMenuOpen.current) {
      wasNotifMenuOpen.current = false;
      const newSeen = latestVisibleAlerts.current.map(a => a.id);
      setSeenAlertIds(prev => Array.from(new Set([...prev, ...newSeen])));
    }
  }, [showNotifMenu, setSeenAlertIds]);
  const displayAlerts = useMemo(() => {
    const unread = visibleAlerts.filter(a => !seenAlertIds.includes(a.id)).reverse();
    const read = visibleAlerts.filter(a => seenAlertIds.includes(a.id)).reverse();
    return [...unread, ...read];
  }, [visibleAlerts, seenAlertIds]);

  // --- FILTER LOGIC FOR RECENT ACTIVITY ---
  const filteredActivity = useMemo(() => {
    let filtered = transactions;
    if (activitySearch) {
      const lowerQuery = activitySearch.toLowerCase();
      filtered = filtered.filter(t => t.contactName && t.contactName.toLowerCase().includes(lowerQuery) || t.description && t.description.toLowerCase().includes(lowerQuery) || t.id && String(t.id).toLowerCase().includes(lowerQuery));
    }
    const today = getIsoDate();
    if (activityDateFilter === 'today') {
      filtered = filtered.filter(t => t.date === today);
    } else if (activityDateFilter === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yesterday = getIsoDate(y);
      filtered = filtered.filter(t => t.date === yesterday);
    } else if (activityDateFilter === 'thisMonth') {
      const month = today.substring(0, 7);
      filtered = filtered.filter(t => t.date.startsWith(month));
    } else if (activityDateFilter === 'custom') {
      filtered = filtered.filter(t => t.date >= activityCustomStart && t.date <= activityCustomEnd);
    }
    if (activityTypeFilter !== 'all') {
      filtered = filtered.filter(t => t.type === activityTypeFilter);
    }
    return filtered;
  }, [transactions, activitySearch, activityDateFilter, activityTypeFilter, activityCustomStart, activityCustomEnd]);
  useEffect(() => {
    const handleClickOutside = e => {
      if (dashFilterRef.current && !dashFilterRef.current.contains(e.target)) setShowFilterMenu(false);
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) setShowNotifMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return /*#__PURE__*/React.createElement("div", {
    className: "p-4 space-y-6 text-left relative pb-24"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold text-slate-800"
  }, "Assalam-o-Alaikum!"), /*#__PURE__*/React.createElement("p", {
    className: "text-blue-600 text-lg font-bold -mt-1"
  }, ownerName || 'Owner'), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2 mt-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1 bg-white border border-slate-100 rounded-full px-2 py-0.5 w-fit shadow-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-bold text-slate-500 uppercase tracking-tighter"
  }, "Viewing: ", filterLabel)), isInvoicePreviewEnabled && /*#__PURE__*/React.createElement("div", {
    className: `flex items-center gap-1 border px-2 py-0.5 rounded-full shadow-sm transition-all duration-300 ${isPrinterConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Printer",
    size: 10
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-black uppercase tracking-widest"
  }, isPrinterConnected ? 'Printer: Connected' : 'Printer: Offline')), !isSubscriptionActive ? /*#__PURE__*/React.createElement("div", {
    className: "bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 animate-pulse"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Lock",
    size: 10
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-black uppercase tracking-widest"
  }, "Plan Khatam")) : subscription && subscription.status === 'trial' && /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Clock",
    size: 10,
    className: "text-amber-600"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-black text-amber-700 uppercase tracking-wide"
  }, "Trial: ", daysLeft, " Din Baqi")))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative",
    ref: notifMenuRef
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowNotifMenu(!showNotifMenu),
    className: "w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 shadow-sm active:scale-90 relative"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Bell",
    size: 20
  }), unreadCount > 0 && /*#__PURE__*/React.createElement("span", {
    className: "absolute -top-1.5 -right-1.5 min-w-[20px] h-5 flex items-center justify-center px-1 bg-red-500 text-white text-[10px] font-black rounded-full border-2 border-white shadow-sm animate-bounce"
  }, unreadCount > 99 ? '99+' : unreadCount)), showNotifMenu && /*#__PURE__*/React.createElement("div", {
    className: "absolute top-12 right-0 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-[100] overflow-hidden flex flex-col max-h-[320px] animate-in zoom-in duration-100 origin-top-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-3 border-b flex justify-between items-center bg-slate-50 shrink-0"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-sm text-slate-800"
  }, "Notifications"), visibleAlerts.length > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsClearNotifModalOpen(true),
    className: "text-[10px] font-bold text-red-500 hover:text-red-600 bg-red-50 px-2 py-1 rounded-md active:scale-95"
  }, "Clear All")), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto no-scrollbar p-2 space-y-2"
  }, visibleAlerts.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "py-6 text-center opacity-40"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "BellOff",
    size: 32,
    className: "mx-auto mb-2"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold uppercase tracking-widest"
  }, "No New Alerts")) : displayAlerts.map(a => {
    const isUnread = !seenAlertIds.includes(a.id);
    return /*#__PURE__*/React.createElement("div", {
      key: a.id,
      className: `p-2 bg-white rounded-xl border flex items-start gap-2 shadow-sm transition-all ${isUnread ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100'}`
    }, /*#__PURE__*/React.createElement("div", {
      className: `mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.type === 'oos' ? 'bg-red-500' : a.type === 'low' ? 'bg-orange-500' : 'bg-blue-500'}`
    }), /*#__PURE__*/React.createElement("div", {
      className: "flex-1 min-w-0 pr-1"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-xs font-bold text-slate-800 leading-tight truncate"
    }, a.name), /*#__PURE__*/React.createElement("p", {
      className: `text-[10px] font-bold mt-0.5 ${a.type === 'oos' ? 'text-red-600' : a.type === 'low' ? 'text-orange-600' : 'text-blue-600'}`
    }, a.msg)), isUnread && /*#__PURE__*/React.createElement("span", {
      className: "text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest mt-0.5 shrink-0 animate-pulse"
    }, "New"));
  })))), /*#__PURE__*/React.createElement("div", {
    className: "relative",
    ref: dashFilterRef
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowFilterMenu(!showFilterMenu),
    className: "w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 shadow-sm active:scale-90 relative"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Filter",
    size: 20
  })), showFilterMenu && /*#__PURE__*/React.createElement("div", {
    className: "absolute top-12 right-0 w-40 bg-white rounded-2xl shadow-xl border border-slate-100 z-[100] overflow-hidden py-1 animate-in zoom-in duration-100 origin-top-right"
  }, ['today', 'yesterday', 'month', 'custom'].map(f => /*#__PURE__*/React.createElement("div", {
    key: f,
    onClick: e => {
      e.stopPropagation();
      setFilter(f);
      setShowFilterMenu(false);
    },
    className: `px-4 py-2 text-xs font-bold capitalize hover:bg-slate-50 ${currentFilter === f ? 'text-blue-600 bg-blue-50/50' : 'text-slate-600'}`
  }, f === 'month' ? 'This Month' : f)))))), currentFilter === 'custom' && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-top duration-300"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase ml-1"
  }, "From"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: customStart || "",
    onChange: e => setCustomStart(e.target.value),
    className: "w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase ml-1"
  }, "To"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: customEnd || "",
    onChange: e => setCustomEnd(e.target.value),
    className: "w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-slate-400 ml-1 tracking-[0.15em]"
  }, "Financial Summary ", isRomanUrduEnabled && "(Maali Hisaab)"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3 -mt-2 mb-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-center border-b border-blue-800"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-black uppercase tracking-widest opacity-80 mb-0.5"
  }, "Total Sale"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-black truncate"
  }, statsGroups.totals.totalSale)), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 grid grid-cols-2 divide-x divide-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-2 text-center bg-green-50/30"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[7px] font-black text-green-600 uppercase tracking-widest"
  }, "Cash"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-800 truncate"
  }, statsGroups.financials[0].value.replace('Rs. ', ''))), /*#__PURE__*/React.createElement("div", {
    className: "p-2 text-center bg-amber-50/30"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[7px] font-black text-amber-600 uppercase tracking-widest"
  }, "Udhaar"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-800 truncate"
  }, statsGroups.financials[1].value.replace('Rs. ', ''))))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-center border-b border-indigo-800"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-black uppercase tracking-widest opacity-80 mb-0.5"
  }, "Total Purchase"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-black truncate"
  }, statsGroups.totals.totalPurchase)), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 grid grid-cols-2 divide-x divide-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-2 text-center bg-blue-50/30"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[7px] font-black text-blue-600 uppercase tracking-widest"
  }, "Cash"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-800 truncate"
  }, statsGroups.financials[2].value.replace('Rs. ', ''))), /*#__PURE__*/React.createElement("div", {
    className: "p-2 text-center bg-slate-50/30"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[7px] font-black text-slate-600 uppercase tracking-widest"
  }, "Udhaar"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-800 truncate"
  }, statsGroups.financials[3].value.replace('Rs. ', '')))))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, statsGroups.financials.slice(4, 8).map((stat, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `${stat.bg} p-4 rounded-2xl border border-white/50 shadow-sm text-left transition-all`
  }, /*#__PURE__*/React.createElement("p", {
    className: `text-[9px] font-bold uppercase ${stat.labelColor || 'text-slate-500'}`
  }, stat.label), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline gap-1.5"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-base font-bold text-slate-800"
  }, stat.value), stat.subNote && /*#__PURE__*/React.createElement("span", {
    className: "text-[7px] font-black text-slate-400 uppercase tracking-tighter italic"
  }, stat.subNote)), isRomanUrduEnabled && /*#__PURE__*/React.createElement("p", {
    className: `text-[8px] font-bold uppercase mt-1 tracking-tighter opacity-70 ${stat.labelColor || 'text-slate-500'}`
  }, stat.romanUrdu))), /*#__PURE__*/React.createElement("div", {
    className: "col-span-2 flex gap-3"
  }, statsGroups.financials.slice(8, 9).map((stat, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `${stat.bg} p-4 rounded-2xl border border-white/50 shadow-sm text-left transition-all flex-1`
  }, /*#__PURE__*/React.createElement("p", {
    className: `text-[9px] font-bold uppercase ${stat.labelColor || 'text-slate-500'}`
  }, stat.label), /*#__PURE__*/React.createElement("p", {
    className: "text-base font-bold text-slate-800"
  }, stat.value), isRomanUrduEnabled && /*#__PURE__*/React.createElement("p", {
    className: `text-[8px] font-bold uppercase mt-1 tracking-tighter opacity-70 ${stat.labelColor || 'text-slate-500'}`
  }, stat.romanUrdu))), /*#__PURE__*/React.createElement("button", {
    onClick: onAddExpense,
    className: "w-1/3 bg-red-50 p-4 rounded-2xl border-b-4 border-red-200 flex flex-col items-center justify-center text-red-600 active:scale-95 transition-all shadow-md"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "PlusCircle",
    size: 20,
    className: "mb-1"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black uppercase leading-tight text-center"
  }, "Add", /*#__PURE__*/React.createElement("br", null), "Expense")))), /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-slate-400 ml-1 tracking-[0.15em] pt-2"
  }, "Ledger Totals ", isRomanUrduEnabled && "(Khata Summary)"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, statsGroups.ledgers.map((stat, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => onStatClick(stat.target, stat.filter),
    className: `${stat.bg} p-4 rounded-2xl border border-white/50 shadow-sm text-left active:scale-95 transition-all`
  }, /*#__PURE__*/React.createElement("p", {
    className: `text-[9px] font-bold uppercase ${stat.labelColor || 'text-slate-500'}`
  }, stat.label), /*#__PURE__*/React.createElement("p", {
    className: "text-base font-bold text-slate-800"
  }, stat.value), isRomanUrduEnabled && /*#__PURE__*/React.createElement("p", {
    className: `text-[8px] font-black uppercase mt-1 tracking-wider ${stat.labelColor}`
  }, stat.urduLabel)))), /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-slate-400 ml-1 tracking-[0.15em] pt-2"
  }, "Inventory & Expiry ", isRomanUrduEnabled && "(Maal ki Tafseel)"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, statsGroups.inventory.map((stat, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => onStatClick(stat.target, stat.filter),
    className: `${stat.bg} p-4 rounded-2xl border border-white/50 shadow-sm text-left active:scale-95 transition-all`
  }, /*#__PURE__*/React.createElement("p", {
    className: `text-[9px] font-bold uppercase ${stat.labelColor || 'text-slate-500'}`
  }, stat.label), /*#__PURE__*/React.createElement("p", {
    className: "text-base font-bold text-slate-800"
  }, stat.value), isRomanUrduEnabled && /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-bold text-slate-400 uppercase mt-1"
  }, stat.romanUrdu)))), /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-slate-400 ml-1 tracking-[0.15em] pt-2"
  }, "Stock Valuation ", isRomanUrduEnabled && "(Maal ki Qeemat)"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, statsGroups.valuation.map((stat, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `${stat.bg} p-4 rounded-2xl border border-white/50 shadow-sm text-left transition-all`
  }, /*#__PURE__*/React.createElement("p", {
    className: `text-[9px] font-bold uppercase ${stat.labelColor || 'text-slate-500'}`
  }, stat.label), /*#__PURE__*/React.createElement("p", {
    className: "text-base font-bold text-slate-800"
  }, stat.value), isRomanUrduEnabled && /*#__PURE__*/React.createElement("p", {
    className: `text-[8px] font-bold uppercase mt-1 opacity-70 ${stat.labelColor || 'text-slate-500'}`
  }, stat.romanUrdu))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pb-8"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-[11px] font-black uppercase text-slate-400 ml-1 tracking-[0.2em]"
  }, "Recent Activity"), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-3 rounded-2xl border border-slate-100 shadow-sm space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Search",
    size: 16,
    className: "absolute left-3 top-2.5 text-slate-400"
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: activitySearch,
    onChange: e => setActivitySearch(e.target.value),
    placeholder: "Search name, details or Bill#...",
    className: "w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-3 rounded-xl outline-none text-xs font-semibold focus:border-blue-400 transition-all"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("select", {
    value: activityDateFilter,
    onChange: e => setActivityDateFilter(e.target.value),
    className: "flex-1 bg-slate-50 border border-slate-200 py-2 px-2 rounded-xl outline-none text-[10px] font-bold text-slate-600 focus:border-blue-400"
  }, /*#__PURE__*/React.createElement("option", {
    value: "today"
  }, "Today"), /*#__PURE__*/React.createElement("option", {
    value: "yesterday"
  }, "Yesterday"), /*#__PURE__*/React.createElement("option", {
    value: "thisMonth"
  }, "This Month"), /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Time"), /*#__PURE__*/React.createElement("option", {
    value: "custom"
  }, "Custom Date")), /*#__PURE__*/React.createElement("select", {
    value: activityTypeFilter,
    onChange: e => setActivityTypeFilter(e.target.value),
    className: "flex-1 bg-slate-50 border border-slate-200 py-2 px-2 rounded-xl outline-none text-[10px] font-bold text-slate-600 focus:border-blue-400"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Types"), /*#__PURE__*/React.createElement("option", {
    value: "sale"
  }, "Sale"), /*#__PURE__*/React.createElement("option", {
    value: "purchase"
  }, "Purchase"), /*#__PURE__*/React.createElement("option", {
    value: "receipt"
  }, "Recovery (In)"), /*#__PURE__*/React.createElement("option", {
    value: "payment"
  }, "Payment (Out)"), /*#__PURE__*/React.createElement("option", {
    value: "expense"
  }, "Expense"), /*#__PURE__*/React.createElement("option", {
    value: "sale_return"
  }, "Sale Return"), /*#__PURE__*/React.createElement("option", {
    value: "purchase_return"
  }, "Purchase Return"))), activityDateFilter === 'custom' && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 animate-in slide-in-from-top duration-300"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase ml-1 block mb-0.5"
  }, "From"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: activityCustomStart,
    onChange: e => setActivityCustomStart(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-400"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase ml-1 block mb-0.5"
  }, "To"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: activityCustomEnd,
    onChange: e => setActivityCustomEnd(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-400"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, filteredActivity.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-6 opacity-40"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold uppercase tracking-widest"
  }, "No Activity Found")) : filteredActivity.slice(0, visibleTxCount).map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    className: "bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between animate-in fade-in transition-all"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0 pr-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: `w-1.5 h-1.5 rounded-full ${t.type === 'sale' ? 'bg-green-500' : t.type === 'purchase' ? 'bg-blue-500' : t.type === 'expense' ? 'bg-red-700' : t.type === 'sale_return' ? 'bg-orange-500' : t.type === 'purchase_return' ? 'bg-teal-500' : 'bg-slate-500'}`
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-bold text-slate-800 truncate"
  }, t.contactName || t.description)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5 text-[9px] text-slate-400 mt-0.5 font-bold uppercase tracking-tight"
  }, /*#__PURE__*/React.createElement("span", {
    className: t.type === 'sale' ? 'text-green-600' : t.type === 'purchase' || t.type === 'expense' ? 'text-red-600' : t.type.includes('return') ? 'text-orange-600' : 'text-blue-600'
  }, t.type === 'receipt' ? 'Recovery' : t.type === 'payment' ? 'Payment' : t.type.replace('_', ' ')), /*#__PURE__*/React.createElement("span", null, "\xE2\u20AC\xA2 ", t.time, " \xE2\u20AC\xA2 ", t.date))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("p", {
    className: `font-bold text-sm leading-none ${t.type === 'sale' || t.type === 'receipt' ? 'text-green-600' : 'text-red-600'}`
  }, "Rs.", formatAmount(t.amount)), t.paidAmount > 0 && t.paidAmount < t.amount && /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] text-slate-400 font-bold uppercase mt-1"
  }, "Paid: ", formatAmount(t.paidAmount))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-0.5 bg-slate-50 p-1 rounded-xl border border-slate-100"
  }, t.type !== 'expense' && /*#__PURE__*/React.createElement("button", {
    onClick: () => onViewBill(t),
    className: "w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 active:scale-90 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Eye",
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => onEdit(t),
    className: "w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-600 active:scale-90 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Pencil",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => onDelete(t),
    className: "w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 active:scale-90 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trash2",
    size: 14
  })))))), filteredActivity.length > visibleTxCount && /*#__PURE__*/React.createElement("button", {
    onClick: () => setVisibleTxCount(prev => prev + 10),
    className: "w-full py-4 mt-2 bg-white border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "PlusCircle",
    size: 16
  }), " See More / Mazeed Dekhein"))), isClearNotifModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in duration-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 ring-4 ring-red-50/50"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "BellOff",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg text-slate-800 mb-1"
  }, "Clear Notifications?"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mb-6 font-medium leading-relaxed"
  }, "Kya aap waqayi sabhi notifications ko clear karna chahte hain?"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsClearNotifModalOpen(false),
    className: "py-3 bg-slate-100 rounded-xl font-bold text-slate-500 text-xs uppercase tracking-widest active:scale-95"
  }, "Nahi"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const newCleared = visibleAlerts.map(a => a.id);
      setClearedAlertIds(prev => Array.from(new Set([...prev, ...newCleared])));
      setIsClearNotifModalOpen(false);
      setShowNotifMenu(false);
    },
    className: "py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95"
  }, "Haan, Clear")))));
};
const LedgerView = ({
  contact,
  transactions,
  shopName,
  shopPhone,
  onBack,
  onPaymentAction,
  onDeleteTransaction,
  onViewBill,
  onDeleteAccount,
  onEditAccount,
  onToggleInactive
}) => {
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showMissingPhoneModal, setShowMissingPhoneModal] = useState(false);
  const lActionRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = e => {
      if (lActionRef.current && !lActionRef.current.contains(e.target)) setShowActionMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const contactTx = useMemo(() => {
    let filtered = transactions.filter(t => t.contactId === contact.id);
    if (filterStart) filtered = filtered.filter(t => t.date >= filterStart);
    if (filterEnd) filtered = filtered.filter(t => t.date <= filterEnd);
    return filtered;
  }, [transactions, contact.id, filterStart, filterEnd]);
  const isLenaHai = contact.balance < 0;
  const handleCommunication = type => {
    if (!contact.phone || contact.phone.length < 10) {
      setShowMissingPhoneModal(true);
      return;
    }
    const cleanNum = formatPhoneForWA(contact.phone);
    if (type === 'whatsapp') {
      let balanceMsg = "";
      if (contact.balance < 0) {
        balanceMsg = `Aap ke zimme Rs. ${formatAmount(Math.abs(contact.balance))} baqi hai. Meherbani karke jald adaigi kar dein.`;
      } else if (contact.balance > 0) {
        balanceMsg = `Hum ne aap ke Rs. ${formatAmount(Math.abs(contact.balance))} dene hain. Jald adaigi kar di jayegi.`;
      } else {
        balanceMsg = `Aap ka hisaab bilkul clear hai.`;
      }
      const rawMsg = `Dear ${contact.name},\n\n${balanceMsg} Shukriya!\n\n*${shopName || "Business"}*\n${shopPhone ? 'ðŸ“ž ' + shopPhone : ''}`;
      const encodedMsg = encodeURIComponent(rawMsg);
      window.open(`https://wa.me/${cleanNum}?text=${encodedMsg}`, '_blank');
    } else {
      window.location.href = `tel:+${cleanNum}`;
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "p-0 space-y-4 text-left min-h-screen bg-slate-50 pb-48"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 bg-slate-50 border-b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    className: "p-2 bg-white rounded-full border shadow-sm active:scale-90 shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ArrowLeft"
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-lg font-bold text-slate-800 flex-1 leading-tight break-words"
  }, contact.name), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 relative shrink-0",
    ref: lActionRef
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowSearch(!showSearch),
    className: `w-10 h-10 rounded-full flex items-center justify-center shadow-sm active:scale-90 border ${showSearch ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Search",
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleCommunication('call'),
    className: "w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-blue-600 shadow-sm active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Phone",
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleCommunication('whatsapp'),
    className: "w-10 h-10 bg-green-500 border border-green-600 rounded-full flex items-center justify-center text-white shadow-sm active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "MessageCircle",
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowActionMenu(!showActionMenu),
    className: "w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-600 shadow-sm active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "MoreVertical",
    size: 18
  })), showActionMenu && /*#__PURE__*/React.createElement("div", {
    className: "absolute top-12 right-0 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 z-[100] overflow-hidden py-1 animate-in zoom-in duration-100 origin-top-right"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onEditAccount(contact);
      setShowActionMenu(false);
    },
    className: "w-full px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "UserPen",
    size: 14,
    className: "text-blue-500"
  }), " Edit Details"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onToggleInactive(contact.id);
      setShowActionMenu(false);
      onBack();
    },
    className: "w-full px-4 py-2.5 text-xs font-bold text-orange-600 hover:bg-orange-50 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "UserMinus",
    size: 14
  }), " Inactive Ledger"), /*#__PURE__*/React.createElement("div", {
    className: "h-px bg-slate-100 my-1"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onDeleteAccount(contact.id);
      setShowActionMenu(false);
    },
    className: "w-full px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trash2",
    size: 14
  }), " Delete Account")))), showSearch && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-2 mb-4 animate-in slide-in-from-top duration-200"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase ml-1"
  }, "Kahan se"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: filterStart || "",
    onChange: e => setFilterStart(e.target.value),
    className: "w-full bg-white border border-slate-200 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase ml-1"
  }, "Kab tak"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: filterEnd || "",
    onChange: e => setFilterEnd(e.target.value),
    className: "w-full bg-white border border-slate-200 p-2 rounded-xl text-xs font-bold text-slate-700 outline-none"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-2xl border flex justify-between items-center shadow-sm mb-2"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest"
  }, "Outstanding Balance"), /*#__PURE__*/React.createElement("p", {
    className: `text-2xl font-bold ${isLenaHai ? 'text-red-600' : 'text-green-600'}`
  }, "Rs. ", formatAmount(Math.abs(contact.balance))), /*#__PURE__*/React.createElement("p", {
    className: `text-[10px] font-black uppercase tracking-widest mt-0.5 ${isLenaHai ? 'text-red-600' : 'text-green-600'}`
  }, isLenaHai ? contact.type === 'supplier' ? 'Advance jo Aap ne lena hai' : 'Aap ne lena hai' : contact.balance > 0 ? 'Aap ne dena hai' : 'Hisaab barabar')), /*#__PURE__*/React.createElement("button", {
    onClick: () => generatePDFStatement(contact, contactTx, shopName),
    className: "flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-bold uppercase active:scale-95"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Download",
    size: 12
  }), " Statement"))), /*#__PURE__*/React.createElement("div", {
    className: "px-4 space-y-4 no-scrollbar"
  }, contactTx.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "py-20 text-center opacity-30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Inbox",
    size: 48
  }), /*#__PURE__*/React.createElement("p", {
    className: "font-bold text-sm"
  }, "Koi record nahi mila.")) : contactTx.map(t => {
    const total = t.amount;
    const paid = t.paidAmount || 0;
    const remaining = total - paid;
    const isPos = t.type === 'sale' || t.type === 'purchase' || t.type === 'sale_return' || t.type === 'purchase_return';
    return /*#__PURE__*/React.createElement("div", {
      key: t.id,
      onClick: () => t.type !== 'expense' && onViewBill(t),
      className: "bg-white p-3 rounded-2xl border-2 border-slate-50 active:border-blue-100 transition-all shadow-sm"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start mb-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-1 min-w-0 pr-2"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-black text-slate-400 uppercase tracking-widest"
    }, t.date, " \xE2\u20AC\xA2 ", t.time), /*#__PURE__*/React.createElement("h4", {
      className: "text-sm font-bold text-slate-800 capitalize flex items-center gap-2"
    }, t.type === 'receipt' ? 'Recovery' : t.type === 'payment' ? 'Payment' : t.type.replace('_', ' '), " ", isPos && /*#__PURE__*/React.createElement("span", {
      className: "bg-slate-100 text-slate-500 text-[8px] px-1.5 rounded-full font-black uppercase"
    }, "Bill# ", t.id))), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-1"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        onPaymentAction(t.type, t);
      },
      className: "text-amber-500 bg-amber-50 p-2 rounded-lg active:scale-90"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "Pencil",
      size: 12
    })), /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        onDeleteTransaction(t);
      },
      className: "text-red-500 bg-red-50 p-2 rounded-lg active:scale-90"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "Trash2",
      size: 12
    })))), isPos ? /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-3 gap-2 bg-slate-50/80 p-2 rounded-xl border border-slate-100 mt-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-center border-r border-slate-200"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[8px] font-bold text-slate-400 uppercase"
    }, "Total Bill"), /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-black text-slate-700"
    }, "Rs. ", formatAmount(total))), /*#__PURE__*/React.createElement("div", {
      className: "text-center border-r border-slate-200"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[8px] font-bold text-slate-400 uppercase"
    }, "Paid"), /*#__PURE__*/React.createElement("p", {
      className: "text-[11px] font-black text-blue-600"
    }, "Rs. ", formatAmount(paid))), /*#__PURE__*/React.createElement("div", {
      className: "text-center"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[8px] font-bold text-slate-400 uppercase"
    }, "Baqaya"), /*#__PURE__*/React.createElement("p", {
      className: `text-[11px] font-black ${remaining > 0 ? 'text-red-500' : 'text-green-500'}`
    }, "Rs. ", formatAmount(remaining)))) : /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center px-2 py-1 bg-slate-50/30 rounded-lg"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-bold text-slate-400 uppercase tracking-tighter"
    }, "Amount"), /*#__PURE__*/React.createElement("p", {
      className: `font-black text-sm ${t.type === 'sale' || t.type === 'receipt' ? 'text-green-600' : 'text-red-600'}`
    }, "Rs. ", formatAmount(total))), t.description && /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] text-slate-500 font-bold mt-2 italic flex items-center gap-1"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "Notebook",
      size: 10
    }), " ", t.description));
  })), /*#__PURE__*/React.createElement("div", {
    className: "fixed bottom-24 left-4 right-4 grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onPaymentAction('receipt'),
    className: "bg-green-600 text-white py-2 rounded-2xl font-bold shadow-lg uppercase text-xs active:scale-95 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl font-black mr-2 pb-1"
  }, "+"), " Maine Liye"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onPaymentAction('payment'),
    className: "bg-red-600 text-white py-2 rounded-2xl font-bold shadow-lg uppercase text-xs active:scale-95 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl font-black mr-2 pb-1"
  }, "-"), " Maine Diye")), showMissingPhoneModal && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in duration-200 border-2 border-orange-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-500 ring-4 ring-orange-50/50"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "PhoneOff",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg text-slate-800 mb-1"
  }, "Number Missing!"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mb-6 font-medium leading-relaxed"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-slate-800"
  }, contact.name), " ka number save nahi hai.", /*#__PURE__*/React.createElement("br", null), "Call ya WhatsApp karne ke liye number add karein."), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowMissingPhoneModal(false),
    className: "py-3 bg-slate-100 rounded-xl font-bold text-slate-500 text-xs uppercase tracking-widest active:scale-95"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowMissingPhoneModal(false);
      onEditAccount(contact);
    },
    className: "py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus",
    size: 14
  }), " Add Number")))));
};
const POS = ({
  productsList,
  addToCart,
  cart,
  setCartTotal,
  cartTotal,
  setIsCheckoutModalOpen,
  posMode,
  setPosMode,
  isWholesaleEnabled,
  isWholesaleMode,
  setIsWholesaleMode,
  isEditing,
  onCancelEdit,
  setActiveTab,
  categories,
  query,
  setQuery,
  activeCategory,
  setActiveCategory,
  setStockError,
  showHeader
}) => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const filtered = useMemo(() => {
    return productsList.filter(p => {
      const matchesSearch = (p.name || "").toLowerCase().includes((query || "").toLowerCase()) || p.barcode && p.barcode.includes(query);
      const matchesCategory = activeCategory === "all" || String(p.categoryId) === String(activeCategory);
      return matchesSearch && matchesCategory;
    });
  }, [productsList, query, activeCategory]);
  const handleManualBarcodeEnter = e => {
    if (e.key === 'Enter' && query.trim()) {
      const exactMatch = productsList.find(p => p.barcode === query.trim());
      if (exactMatch) {
        const price = isWholesaleMode && (posMode === 'sale' || posMode === 'sale_return') && exactMatch.wholesalePrice > 0 ? exactMatch.wholesalePrice : posMode === 'sale' || posMode === 'sale_return' ? exactMatch.salePrice : exactMatch.purchasePrice;
        addToCart(exactMatch, price);
        setQuery(""); // Clear after adding
      } else {
        setStockError(`Item Not Found (Barcode: ${query})`);
        playBeep(); // Using beep as error sound feedback as well
      }
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "p-4 flex flex-col text-left pb-32"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sticky top-0 z-[55] bg-slate-50 -mx-4 px-4 pt-2 pb-3 mb-2 shadow-sm border-b border-slate-200/50"
  }, /*#__PURE__*/React.createElement("div", {
    className: `shrink-0 transition-all duration-300 ease-in-out overflow-hidden flex flex-col gap-2 ${showHeader ? 'max-h-24 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 bg-slate-200 p-1 rounded-xl flex items-center"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => !isEditing && setPosMode('sale'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold ${posMode === 'sale' ? 'bg-green-600 text-white shadow' : 'text-slate-500'}`
  }, "Sale"), /*#__PURE__*/React.createElement("button", {
    onClick: () => !isEditing && setPosMode('purchase'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold ${posMode === 'purchase' ? 'bg-blue-600 text-white shadow' : 'text-slate-500'}`
  }, "Purchase"), /*#__PURE__*/React.createElement("button", {
    onClick: () => !isEditing && setPosMode('sale_return'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold ${posMode.includes('return') ? 'bg-red-500 text-white shadow' : 'text-slate-500'}`
  }, "Return Mode"))), posMode.includes('return') && /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 animate-in slide-in-from-top-2 duration-200"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => !isEditing && setPosMode('sale_return'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold border ${posMode === 'sale_return' ? 'bg-red-50 border-red-500 text-red-600 shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`
  }, "Sale Return"), /*#__PURE__*/React.createElement("button", {
    onClick: () => !isEditing && setPosMode('purchase_return'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold border ${posMode === 'purchase_return' ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-sm' : 'bg-white border-slate-200 text-slate-500'}`
  }, "Purchase Return"))), isWholesaleEnabled && (posMode === 'sale' || posMode === 'sale_return') && !isEditing && /*#__PURE__*/React.createElement("div", {
    className: `shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${showHeader ? 'max-h-20 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-100 shadow-sm animate-in fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-orange-600"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ShoppingBag",
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-black uppercase tracking-widest"
  }, "Wholesale Mode")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsWholesaleMode(!isWholesaleMode),
    className: `w-12 h-6 rounded-full relative ${isWholesaleMode ? 'bg-orange-500' : 'bg-slate-200'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${isWholesaleMode ? 'right-1' : 'left-1'}`
  })))), isEditing && /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-100 border border-amber-200 p-3 rounded-2xl flex justify-between items-center animate-in slide-in-from-top shrink-0 mb-3"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-amber-800 uppercase tracking-widest flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Pencil",
    size: 14
  }), " Editing Mode ON"), /*#__PURE__*/React.createElement("button", {
    onClick: onCancelEdit,
    className: "text-[10px] font-black bg-white px-3 py-1 rounded-lg text-red-500 border border-red-100 shadow-sm active:scale-90 uppercase"
  }, "Cancel")), /*#__PURE__*/React.createElement("div", {
    className: "relative shrink-0"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: query || "",
    onChange: e => setQuery(e.target.value),
    onKeyDown: handleManualBarcodeEnter,
    placeholder: "Search or Scan Barcode...",
    className: "w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm font-medium shadow-sm outline-none focus:border-green-500 transition-all"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsScannerOpen(true),
    className: `absolute right-3 top-2.5 p-1 active:scale-90 transition-colors text-green-600`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ScanBarcode",
    size: 22
  }))), /*#__PURE__*/React.createElement("div", {
    className: `shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${showHeader ? 'max-h-20 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 overflow-x-auto no-scrollbar pb-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveCategory("all"),
    className: `px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${activeCategory === "all" ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`
  }, "All Items"), categories.map(cat => /*#__PURE__*/React.createElement("button", {
    key: cat.id,
    onClick: () => setActiveCategory(cat.id),
    className: `px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${String(activeCategory) === String(cat.id) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`
  }, cat.name))))), isScannerOpen && /*#__PURE__*/React.createElement(HighSpeedScannerPopup, {
    scannerId: "pos-reader-popup",
    cart: cart,
    cartTotal: cartTotal,
    showCheckout: true,
    onScan: text => {
      const found = productsList.find(p => p.barcode === text);
      if (found) {
        const price = isWholesaleMode && (posMode === 'sale' || posMode === 'sale_return') && found.wholesalePrice > 0 ? found.wholesalePrice : posMode === 'sale' || posMode === 'sale_return' ? found.salePrice : found.purchasePrice;
        addToCart(found, price);
      } else {
        setStockError(`Item Not Found (Barcode: ${text})`);
        playBeep();
      }
    },
    onClose: () => setIsScannerOpen(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-2 no-scrollbar"
  }, filtered.map(p => {
    const price = isWholesaleMode && (posMode === 'sale' || posMode === 'sale_return') && p.wholesalePrice > 0 ? p.wholesalePrice : posMode === 'sale' || posMode === 'sale_return' ? p.salePrice : p.purchasePrice;
    const qtyInCart = (cart.find(item => item.id === p.id) || {}).quantity || 0;
    return /*#__PURE__*/React.createElement("button", {
      key: p.id,
      onClick: () => addToCart(p, price),
      className: `relative p-2 rounded-xl border flex flex-col items-center shadow-sm active:scale-95 transition-all ${qtyInCart > 0 ? 'bg-green-50 border-green-500' : 'bg-white border-slate-100'} ${(posMode === 'sale' || posMode === 'purchase_return') && p.openingStock <= 0 ? 'opacity-50' : ''}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-full aspect-square bg-slate-50 rounded-lg mb-1 overflow-hidden flex items-center justify-center"
    }, p.image ? /*#__PURE__*/React.createElement("img", {
      src: p.image,
      className: "w-full h-full object-cover"
    }) : /*#__PURE__*/React.createElement(Icon, {
      name: "Package",
      size: 24,
      className: "text-slate-300"
    })), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-bold line-clamp-1 text-center px-1"
    }, p.name), /*#__PURE__*/React.createElement("p", {
      className: `text-[9px] font-bold ${isWholesaleMode && (posMode === 'sale' || posMode === 'sale_return') ? 'text-orange-600' : 'text-slate-500'}`
    }, "Rs. ", formatAmount(price)), qtyInCart > 0 && /*#__PURE__*/React.createElement("div", {
      className: "absolute top-1 right-1 bg-green-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full z-20 shadow-sm"
    }, qtyInCart));
  })), /*#__PURE__*/React.createElement("div", {
    className: `fixed bottom-24 left-4 right-4 text-white p-4 rounded-2xl flex justify-between items-center shadow-xl z-40 ${posMode === 'sale' ? isWholesaleMode ? 'bg-orange-600' : 'bg-slate-900' : posMode === 'purchase' ? 'bg-blue-900' : posMode === 'sale_return' ? 'bg-red-700' : 'bg-teal-700'}`
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold uppercase"
  }, "Total Qty: ", cart.reduce((a, b) => a + b.quantity, 0)), /*#__PURE__*/React.createElement("p", {
    className: "text-lg font-bold"
  }, "Rs. ", formatAmount(cartTotal))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsCheckoutModalOpen(true),
    disabled: cart.length === 0,
    className: "px-6 py-2 bg-green-600 rounded-xl font-bold text-sm active:scale-95 shadow-md"
  }, "Checkout")));
};
const LedgersSection = ({
  contactsList,
  setIsAddContactModalOpen,
  setSelectedLedger,
  contactListTab,
  setContactListTab,
  onToggleInactive
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactiveMenu, setShowInactiveMenu] = useState(false);
  const [isViewingInactive, setIsViewingInactive] = useState(false);
  const ledgerSecRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = e => {
      if (ledgerSecRef.current && !ledgerSecRef.current.contains(e.target)) setShowInactiveMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const filteredContacts = useMemo(() => contactsList.filter(c => c.type === contactListTab && (isViewingInactive ? c.isInactive : !c.isInactive) && ((c.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) || c.phone && c.phone.includes(searchTerm))), [contactsList, contactListTab, searchTerm, isViewingInactive]);
  return /*#__PURE__*/React.createElement("div", {
    className: "p-4 space-y-4 text-left relative pb-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-bold flex items-center gap-2"
  }, isViewingInactive && /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsViewingInactive(false),
    className: "text-blue-600"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ArrowLeft",
    size: 20
  })), isViewingInactive ? 'Inactive Accounts' : 'Ledgers'), !isViewingInactive && /*#__PURE__*/React.createElement("div", {
    className: "relative",
    ref: ledgerSecRef
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowInactiveMenu(!showInactiveMenu),
    className: "p-2 text-slate-400 active:bg-slate-100 rounded-full transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "MoreVertical"
  })), showInactiveMenu && /*#__PURE__*/React.createElement("div", {
    className: "absolute top-10 right-0 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 z-[100] overflow-hidden py-1 animate-in zoom-in duration-100 origin-top-right"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsViewingInactive(true);
      setShowInactiveMenu(false);
    },
    className: "w-full px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "UserX",
    size: 14,
    className: "text-orange-500"
  }), " Inactive Accounts")))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 bg-slate-200 p-1 rounded-xl flex items-center"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setContactListTab('customer'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold transition-all ${contactListTab === 'customer' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`
  }, "Customers"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setContactListTab('supplier'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold transition-all ${contactListTab === 'supplier' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`
  }, "Suppliers")), !isViewingInactive && /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsAddContactModalOpen(true),
    className: "bg-green-600 text-white p-3 rounded-xl shadow active:scale-95 transition-all animate-in zoom-in"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus",
    size: 24
  }))), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Search",
    size: 16,
    className: "absolute left-3 top-3 text-slate-400"
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: `Search ${contactListTab}...`,
    value: searchTerm || "",
    onChange: e => setSearchTerm(e.target.value),
    className: "w-full bg-white border border-slate-200 p-2.5 pl-10 rounded-xl outline-none text-sm font-semibold shadow-sm focus:border-blue-400"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 no-scrollbar"
  }, filteredContacts.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "py-20 text-center opacity-20"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: isViewingInactive ? "UserCheck" : "UserSearch",
    size: 48
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold uppercase mt-2"
  }, isViewingInactive ? 'No Inactive Accounts' : 'No Accounts Found')) : filteredContacts.map(c => {
    const isLenaHai = c.balance < 0;
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      className: "bg-white p-4 rounded-2xl border flex items-center gap-4 shadow-sm active:bg-slate-50 transition-all cursor-pointer",
      onClick: () => !isViewingInactive && setSelectedLedger(c)
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold shrink-0"
    }, c.name.charAt(0)), /*#__PURE__*/React.createElement("div", {
      className: "flex-1 min-w-0"
    }, /*#__PURE__*/React.createElement("h4", {
      className: "font-bold text-slate-800 truncate text-sm"
    }, c.name), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] text-slate-400 uppercase"
    }, c.phone)), /*#__PURE__*/React.createElement("div", {
      className: "text-right flex flex-col items-end gap-1"
    }, /*#__PURE__*/React.createElement("p", {
      className: `font-bold text-sm ${isLenaHai ? 'text-red-600' : 'text-green-600'}`
    }, "Rs. ", formatAmount(Math.abs(c.balance))), /*#__PURE__*/React.createElement("p", {
      className: `text-[8px] font-black uppercase tracking-tighter ${isLenaHai ? 'text-red-600' : 'text-green-600'}`
    }, isLenaHai ? 'Lena Hai' : c.balance > 0 ? 'Dena Hai' : 'Clear'), isViewingInactive && /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        onToggleInactive(c.id);
      },
      className: "bg-green-50 text-green-600 text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-green-100 active:scale-90"
    }, " Active Ledger ")));
  })));
};
const ProductSection = ({
  productsList,
  setProductsList,
  stockFilter,
  setStockFilter,
  setIsAddModalOpen,
  resetProductForm,
  handleEditProduct,
  categories,
  setCategories,
  pQuery,
  setPQuery,
  activeCategory,
  setActiveCategory,
  onPerformanceOpen,
  showHeader
}) => {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const filteredP = useMemo(() => {
    let filtered = productsList.filter(p => (p.name || "").toLowerCase().includes((pQuery || "").toLowerCase()) || p.barcode && p.barcode.includes(pQuery));
    if (activeCategory !== 'all') {
      filtered = filtered.filter(p => String(p.categoryId) === String(activeCategory));
    }
    if (stockFilter === 'outofstock') filtered = filtered.filter(p => p.openingStock <= 0);else if (stockFilter === 'lowstock') filtered = filtered.filter(p => p.openingStock > 0 && p.openingStock <= (p.minStock || 0));else if (stockFilter === 'nearexpiry') filtered = filtered.filter(p => isNearExpiry(p.expiryDate));
    return filtered;
  }, [productsList, pQuery, stockFilter, activeCategory]);
  return /*#__PURE__*/React.createElement("div", {
    className: "p-4 text-left pb-28"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sticky top-0 z-[55] bg-slate-50 -mx-4 px-4 pt-2 pb-3 mb-2 shadow-sm border-b border-slate-200/50"
  }, /*#__PURE__*/React.createElement("div", {
    className: `shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${showHeader ? 'max-h-20 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-bold text-slate-800"
  }, "Products"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onPerformanceOpen,
    className: "bg-blue-50 text-blue-600 border border-blue-200 px-3 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-sm flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trophy",
    size: 14
  }), " Performance"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      resetProductForm();
      setIsAddModalOpen(true);
    },
    className: "bg-green-600 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase active:scale-95 shadow-md flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus",
    size: 14
  }), " Add Item")))), /*#__PURE__*/React.createElement("div", {
    className: "relative shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Search",
    size: 16,
    className: "absolute left-3 top-3.5 text-slate-400"
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: pQuery || "",
    onChange: e => setPQuery(e.target.value),
    placeholder: "Search...",
    className: "w-full bg-white border border-slate-200 p-3 pl-10 pr-12 rounded-xl outline-none text-sm font-semibold shadow-sm focus:border-green-500 transition-all"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsScannerOpen(true),
    className: `absolute right-3 top-2.5 p-1 active:scale-90 transition-colors text-green-600`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ScanBarcode",
    size: 22
  }))), /*#__PURE__*/React.createElement("div", {
    className: `shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${showHeader ? 'max-h-32 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 overflow-x-auto no-scrollbar py-1 items-center"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveCategory("all"),
    className: `px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${activeCategory === "all" ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`
  }, "All"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowCatManager(true),
    className: "h-7 w-7 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shadow-sm active:scale-90 shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Plus",
    size: 14
  })), categories.map(cat => /*#__PURE__*/React.createElement("button", {
    key: cat.id,
    onClick: () => setActiveCategory(cat.id),
    className: `px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all whitespace-nowrap ${String(activeCategory) === String(cat.id) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 border-slate-200'}`
  }, cat.name))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 overflow-x-auto no-scrollbar py-1 border-t pt-2 border-slate-200"
  }, ['all', 'outofstock', 'lowstock', 'nearexpiry'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    onClick: () => setStockFilter(f),
    className: `px-4 py-1.5 rounded-full text-[10px] font-bold uppercase border transition-all whitespace-nowrap ${stockFilter === f ? 'bg-blue-100 text-blue-700 border-blue-200 shadow-inner' : 'bg-white text-slate-400 border-slate-200'}`
  }, f === 'all' ? 'All' : f === 'outofstock' ? 'Out of Stock' : f === 'lowstock' ? 'Low Stock' : 'Near Expiry')))))), isScannerOpen && /*#__PURE__*/React.createElement(HighSpeedScannerPopup, {
    scannerId: "prod-reader-popup",
    showCheckout: false,
    onScan: text => {
      setPQuery(text);
      setIsScannerOpen(false);
    },
    onClose: () => setIsScannerOpen(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, filteredP.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    className: "bg-white p-3 rounded-2xl border border-slate-100 flex items-center gap-3 shadow-sm relative group animate-in fade-in transition-all"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-14 h-14 bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center shadow-inner shrink-0"
  }, p.image ? /*#__PURE__*/React.createElement("img", {
    src: p.image,
    className: "w-full h-full object-cover"
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "Package",
    size: 24,
    className: "text-slate-300"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-bold text-slate-800 text-sm truncate"
  }, p.name), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-tighter"
  }, p.barcode || 'No Barcode'), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 mt-1 items-center flex-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md border border-green-100"
  }, "Sale: ", formatAmount(p.salePrice)), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 italic"
  }, "Last Cost: ", formatAmount(p.purchasePrice)), /*#__PURE__*/React.createElement("span", {
    className: `text-[10px] font-bold px-2 py-0.5 rounded-md border ${p.openingStock > (p.minStock || 0) ? 'text-blue-600 bg-blue-50 border-blue-100' : 'text-red-600 bg-red-50 border-red-100'}`
  }, "Stock: ", p.openingStock), p.expiryDate && /*#__PURE__*/React.createElement("span", {
    className: `text-[9px] font-bold px-2 py-0.5 rounded-md border ${isNearExpiry(p.expiryDate) ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`
  }, "Exp: ", p.expiryDate))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-1 shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => handleEditProduct(p),
    className: "p-2 bg-slate-50 text-slate-400 rounded-lg active:bg-blue-50 active:text-blue-500 transition-all active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Pencil",
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (window.confirm('Are you sure?')) setProductsList(productsList.filter(x => x.id !== p.id));
    },
    className: "p-2 bg-slate-50 text-slate-400 rounded-lg active:bg-red-50 active:text-red-500 transition-all active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trash2",
    size: 14
  })))))), showCatManager && /*#__PURE__*/React.createElement(CategoryManagerModal, {
    categories: categories,
    setCategories: setCategories,
    onClose: () => setShowCatManager(false)
  }));
};
const AddProductModal = ({
  editingProduct,
  itemName,
  setItemName,
  barcode,
  setBarcode,
  purchasePrice,
  setPurchasePrice,
  salePrice,
  setSalePrice,
  wholesalePrice,
  setWholesalePrice,
  openingStock,
  setOpeningStock,
  minStock,
  setMinStock,
  expiryDate,
  setExpiryDate,
  productImage,
  setProductImage,
  setIsAddModalOpen,
  resetProductForm,
  productsList,
  setProductsList,
  setStockError,
  categories,
  setCategories,
  productCategoryId,
  setProductCategoryId
}) => {
  const [isAddingScannerOpen, setIsAddingScannerOpen] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [errors, setErrors] = useState({});
  const handleSave = () => {
    const newErrors = {};
    if (!itemName) newErrors.itemName = true;
    if (!purchasePrice) newErrors.purchasePrice = true;
    if (!salePrice) newErrors.salePrice = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setStockError("Bhai, zaroori fields (Name, Cost, Sale Price) poori karein.");
      return;
    }
    if (barcode && barcode.trim() !== "") {
      const existingProduct = productsList.find(p => p.barcode === (barcode || "").trim() && (!editingProduct || p.id !== editingProduct.id));
      if (existingProduct) {
        setStockError(`Yeh barcode pehle se "${existingProduct.name}" ke liye mojood hai.`);
        return;
      }
    }
    const pPrice = parseFloat(purchasePrice) || 0;
    const sPrice = parseFloat(salePrice) || 0;
    const wPrice = parseFloat(wholesalePrice) || 0;
    if (sPrice < pPrice) {
      setStockError("Sale Price kam hai! (Sale Price cannot be less than Purchase Price)");
      return;
    }
    if (wPrice > 0 && wPrice < pPrice) {
      setStockError("Wholesale Price kam hai! (Wholesale Price cannot be less than Purchase Price)");
      return;
    }
    const pData = {
      id: editingProduct ? editingProduct.id : Date.now(),
      name: itemName.trim(),
      barcode: (barcode || "").trim(),
      purchasePrice: pPrice,
      avgCost: editingProduct ? editingProduct.avgCost || editingProduct.purchasePrice : pPrice,
      salePrice: sPrice,
      wholesalePrice: wPrice,
      openingStock: parseFloat(openingStock) || 0,
      minStock: parseFloat(minStock || 0),
      expiryDate: expiryDate || "",
      image: productImage || null,
      categoryId: productCategoryId || "all"
    };
    if (editingProduct) {
      setProductsList(productsList.map(p => p.id === editingProduct.id ? pData : p));
    } else {
      setProductsList([...productsList, pData]);
    }
    resetProductForm();
    setIsAddModalOpen(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-end justify-center sm:items-center p-4 sm:p-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar text-left animate-in slide-in-from-bottom duration-300"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center border-b border-slate-50 pb-2"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-slate-800 text-lg"
  }, editingProduct ? 'Edit Product' : 'Add New Product'), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsAddModalOpen(false);
      resetProductForm();
    },
    className: "p-2 bg-slate-50 rounded-full active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest"
  }, "Product Photo"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => document.getElementById('p_img_cam').click(),
    className: "flex-1 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-600 active:bg-blue-100 flex items-center justify-center gap-2 transition-all shadow-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Camera",
    size: 18
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold uppercase tracking-tight"
  }, "Camera")), /*#__PURE__*/React.createElement("button", {
    onClick: () => document.getElementById('p_img_gal').click(),
    className: "flex-1 p-3 bg-green-50 border border-green-200 rounded-xl text-green-600 active:bg-green-100 flex items-center justify-center gap-2 transition-all shadow-sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Image",
    size: 18
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold uppercase tracking-tight"
  }, "Gallery"))), productImage && /*#__PURE__*/React.createElement("div", {
    className: "relative w-full h-32"
  }, /*#__PURE__*/React.createElement("img", {
    src: productImage,
    className: "w-full h-full rounded-2xl object-cover border shadow-md"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setProductImage(null),
    className: "absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X",
    size: 14
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1"
  }, "Category (POS Linking)"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowCatManager(true),
    className: "text-[9px] font-bold text-blue-600 uppercase border-b border-blue-600"
  }, "Manage Categories")), /*#__PURE__*/React.createElement("select", {
    value: productCategoryId || "all",
    onChange: e => setProductCategoryId(e.target.value),
    className: "w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold shadow-inner focus:border-green-500 text-sm"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Items (General)"), categories.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-red-500 uppercase tracking-widest"
  }, "Name*"), /*#__PURE__*/React.createElement("input", {
    value: itemName || "",
    onChange: e => {
      setItemName(e.target.value);
      setErrors({
        ...errors,
        itemName: false
      });
    },
    className: `w-full p-3 bg-slate-50 border ${errors.itemName ? 'border-red-500' : 'border-slate-100'} rounded-xl outline-none font-bold shadow-inner focus:border-green-500 text-sm`,
    placeholder: "Enter Product Name"
  }), errors.itemName && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-red-500 mt-1 ml-1 animate-pulse"
  }, "Bhai, Item ka naam likhna zaroori hai.")), isAddingScannerOpen && /*#__PURE__*/React.createElement(HighSpeedScannerPopup, {
    scannerId: "add-reader-popup",
    showCheckout: false,
    onScan: text => {
      setBarcode(text);
      setIsAddingScannerOpen(false);
    },
    onClose: () => setIsAddingScannerOpen(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase"
  }, "Barcode"), /*#__PURE__*/React.createElement("input", {
    value: barcode || "",
    onChange: e => setBarcode(e.target.value),
    className: "w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none shadow-inner font-semibold pr-10 text-sm",
    placeholder: "Barcode"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsAddingScannerOpen(true),
    className: "absolute right-2 top-7 text-green-600 active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ScanBarcode",
    size: 20
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase"
  }, "Unit"), /*#__PURE__*/React.createElement("select", {
    className: "w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none shadow-inner text-sm"
  }, /*#__PURE__*/React.createElement("option", null, "Pcs"), /*#__PURE__*/React.createElement("option", null, "KG"), /*#__PURE__*/React.createElement("option", null, "LTR")))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-red-500 uppercase tracking-widest"
  }, "Last Purchase Cost*"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: purchasePrice || "",
    onChange: e => {
      setPurchasePrice(e.target.value);
      setErrors({
        ...errors,
        purchasePrice: false
      });
    },
    className: `w-full p-3 bg-slate-50 border ${errors.purchasePrice ? 'border-red-500' : 'border-slate-100'} rounded-xl outline-none font-bold shadow-inner text-sm`,
    placeholder: "0"
  }), errors.purchasePrice && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-red-500 mt-1 ml-1 leading-tight animate-pulse"
  }, "Khareed (Cost) price likhna zaroori hai.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-red-500 uppercase tracking-widest"
  }, "Retail Price*"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: salePrice || "",
    onChange: e => {
      setSalePrice(e.target.value);
      setErrors({
        ...errors,
        salePrice: false
      });
    },
    className: `w-full p-3 bg-slate-50 border ${errors.salePrice ? 'border-red-500' : 'border-slate-100'} rounded-xl outline-none font-bold shadow-inner text-sm`,
    placeholder: "0"
  }), errors.salePrice && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-red-500 mt-1 ml-1 leading-tight animate-pulse"
  }, "Farokht (Sale) price likhna zaroori hai."))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[9px] font-black text-orange-500 uppercase ml-1"
  }, "Wholesale Price"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: wholesalePrice || "",
    onChange: e => setWholesalePrice(e.target.value),
    className: "w-full p-3 bg-slate-50 border border-orange-100 rounded-xl outline-none font-bold shadow-inner text-sm",
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest"
  }, "Stock"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: openingStock || "",
    onChange: e => setOpeningStock(e.target.value),
    className: "w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none font-bold shadow-inner text-sm",
    placeholder: "0"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-blue-500 uppercase ml-1"
  }, "Low Stock Alert"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: minStock || "",
    onChange: e => setMinStock(e.target.value),
    className: "w-full p-3 bg-blue-50 border-blue-100 rounded-xl outline-none font-bold shadow-inner text-sm",
    placeholder: "0"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-orange-500 uppercase ml-1 tracking-widest"
  }, "Expiry Date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: expiryDate || "",
    onChange: e => setExpiryDate(e.target.value),
    className: "w-full p-3 bg-orange-50 border-orange-100 rounded-xl font-bold shadow-inner text-sm"
  })))), /*#__PURE__*/React.createElement("button", {
    onClick: handleSave,
    className: `w-full p-4 text-white rounded-2xl font-bold uppercase shadow-lg text-xs tracking-widest active:scale-95 transition-all mt-4 border-b-4 bg-green-600 border-green-800`
  }, "Save Product")), showCatManager && /*#__PURE__*/React.createElement(CategoryManagerModal, {
    categories: categories,
    setCategories: setCategories,
    onClose: () => setShowCatManager(false)
  }));
};
const CheckoutModal = ({
  setIsCheckoutModalOpen,
  cart,
  setCart,
  cartTotal,
  onComplete,
  posMode,
  contactsList,
  updateCartQty,
  removeCartItem,
  clearCart,
  isWhatsappEnabled,
  isEditing
}) => {
  const [step, setStep] = useState('summary');
  const [partialPaid, setPartialPaid] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState("flat");
  const [editingPriceItemId, setEditingPriceItemId] = useState(null);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [waCashPhone, setWaCashPhone] = useState("");
  const [missingWANumberContact, setMissingWANumberContact] = useState(null);
  const [tempWANumber, setTempWANumber] = useState("");

  // --- UPDATED LOGIC FOR WA TOGGLE ---
  // Ab hum 'useLocalStorage' use kar rahe hain taake browser isay yaad rakhe
  const [waTogglePref, setWaTogglePref] = useLocalStorage('gs_v4_wa_toggle_pref', true);

  // Asal state ab Settings aur User Preference dono par depend karegi
  const isWaToggled = isWhatsappEnabled && waTogglePref;
  const relevantContactType = posMode === 'sale' || posMode === 'sale_return' ? 'customer' : 'supplier';
  const relevantContacts = contactsList.filter(c => c.type === relevantContactType && !c.isInactive);
  const filteredRelevantContacts = useMemo(() => relevantContacts.filter(c => (c.name || "").toLowerCase().includes((contactSearchQuery || "").toLowerCase()) || c.phone && c.phone.includes(contactSearchQuery)), [relevantContacts, contactSearchQuery]);
  const totalQty = useMemo(() => cart.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0), 0), [cart]);
  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue) || 0;
    return discountType === 'percent' ? cartTotal * val / 100 : val;
  }, [cartTotal, discountValue, discountType]);
  const finalNetTotal = Math.max(0, cartTotal - discountAmount);
  const handleInlineChange = (id, field, value) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newObj = {
          ...item
        };
        if (field === 'price') newObj.priceUsed = value;
        if (field === 'qty') newObj.quantity = value;
        if (field === 'salePrice') newObj.salePrice = value;
        if (field === 'wholesalePrice') newObj.wholesalePrice = value;
        if (field === 'price' && (posMode === 'purchase' || posMode === 'purchase_return')) newObj.purchasePrice = value;
        return newObj;
      }
      return item;
    }));
  };
  const isCartInvalid = useMemo(() => cart.some(item => {
    const price = parseFloat(item.priceUsed);
    const qty = parseFloat(item.quantity);
    return isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0;
  }), [cart]);
  const triggerComplete = (paymentType, contact = null, isWA = false, paid = 0, customWANumber = null) => {
    let waNumber = null;
    if (isWA) {
      waNumber = customWANumber || (contact ? contact.phone : waCashPhone);
    }
    onComplete(paymentType, contact, isWA, paid, parseFloat(discountValue) || 0, discountType, discountAmount, waNumber);
  };
  if (step === 'waCashPhone') {
    return /*#__PURE__*/React.createElement("div", {
      className: "fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-md flex items-end justify-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white w-full max-sm rounded-t-3xl shadow-2xl p-6 animate-in slide-in-from-bottom text-left"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-6"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setStep('summary'),
      className: "p-2 text-slate-400"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "ArrowLeft"
    })), /*#__PURE__*/React.createElement("h3", {
      className: "font-bold"
    }, "WhatsApp Cash Billing")), /*#__PURE__*/React.createElement("button", {
      onClick: () => setIsCheckoutModalOpen(false),
      className: "p-2 bg-slate-50 rounded-full"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "X"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block"
    }, "Customer Phone Number"), /*#__PURE__*/React.createElement("input", {
      type: "tel",
      value: waCashPhone,
      onChange: e => setWaCashPhone(e.target.value),
      placeholder: "e.g. 0300 1234567",
      className: "w-full bg-slate-50 border-2 border-slate-200 p-4 rounded-2xl font-bold outline-none focus:border-green-500 transition-all shadow-inner",
      autoFocus: true
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => triggerComplete('Cash', null, true),
      disabled: !waCashPhone,
      className: `w-full py-4 rounded-2xl font-bold text-white uppercase text-xs tracking-widest shadow-lg transition-all ${!waCashPhone ? 'bg-slate-300' : 'bg-green-600 active:scale-95'}`
    }, "Complete & Send WhatsApp"))));
  }
  if (step === 'selectContact' || step === 'selectContactWA') {
    const isWA = step === 'selectContactWA';
    return /*#__PURE__*/React.createElement("div", {
      className: "fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-md flex items-end justify-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white w-full max-sm rounded-t-3xl shadow-2xl max-h-[95vh] flex flex-col p-4 animate-in slide-in-from-bottom text-left"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setStep('summary'),
      className: "p-2 text-slate-400"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "ArrowLeft"
    })), /*#__PURE__*/React.createElement("h3", {
      className: "font-bold text-sm"
    }, isWA ? 'Ledger + WhatsApp' : 'Udhaar Account')), /*#__PURE__*/React.createElement("button", {
      onClick: () => setIsCheckoutModalOpen(false),
      className: "p-2 bg-slate-50 rounded-full"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "X"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-4"
    }, /*#__PURE__*/React.createElement("label", {
      className: "text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 block"
    }, "Cash Paid Today (Optional)"), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center bg-white border-2 border-blue-200 rounded-xl px-4 py-2 shadow-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-blue-600 mr-2 text-sm"
    }, "Rs."), /*#__PURE__*/React.createElement("input", {
      type: "number",
      value: partialPaid || "",
      onChange: e => setPartialPaid(e.target.value),
      placeholder: "0.00",
      className: "w-full bg-transparent outline-none font-bold text-sm"
    })), /*#__PURE__*/React.createElement("p", {
      className: "text-[9px] text-blue-400 mt-2 font-bold uppercase italic"
    }, "Remaining Rs. ", formatAmount(finalNetTotal - (parseFloat(partialPaid) || 0)), " will be added to ledger")), /*#__PURE__*/React.createElement("div", {
      className: "px-2 mb-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "relative"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "Search",
      size: 14,
      className: "absolute left-3 top-3 text-slate-400"
    }), /*#__PURE__*/React.createElement("input", {
      type: "text",
      placeholder: "Search by name or phone...",
      value: contactSearchQuery || "",
      onChange: e => setContactSearchQuery(e.target.value),
      className: "w-full bg-slate-100 border border-slate-200 p-2 pl-9 rounded-xl outline-none text-xs font-semibold shadow-inner focus:border-blue-400 transition-all"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "flex-1 overflow-y-auto space-y-2 no-scrollbar p-2"
    }, /*#__PURE__*/React.createElement("label", {
      className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block"
    }, "Select Account"), filteredRelevantContacts.length === 0 ? /*#__PURE__*/React.createElement("div", {
      className: "py-8 text-center opacity-30"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "UserSearch",
      size: 32
    }), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] font-bold mt-2 uppercase tracking-widest"
    }, "No matching accounts")) : filteredRelevantContacts.map(contact => {
      const isLenaHai = contact.balance < 0;
      return /*#__PURE__*/React.createElement("button", {
        key: contact.id,
        onClick: () => {
          if (isWA && !contact.phone) {
            setMissingWANumberContact(contact);
            setTempWANumber("");
            setStep('missingWA');
          } else {
            triggerComplete('Credit', contact, isWA, parseFloat(partialPaid) || 0);
          }
        },
        className: "w-full p-4 bg-slate-50 rounded-2xl flex items-center gap-4 text-left active:bg-slate-100 transition-all border border-slate-100 shadow-sm"
      }, /*#__PURE__*/React.createElement("div", {
        className: "w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0"
      }, contact.name.charAt(0)), /*#__PURE__*/React.createElement("div", {
        className: "flex-1 min-w-0 pr-2"
      }, /*#__PURE__*/React.createElement("p", {
        className: "font-bold truncate text-sm"
      }, contact.name), /*#__PURE__*/React.createElement("p", {
        className: "text-[10px] text-slate-400 font-bold tracking-wider"
      }, contact.phone || "No Number")), /*#__PURE__*/React.createElement("div", {
        className: "text-right"
      }, /*#__PURE__*/React.createElement("p", {
        className: `text-[10px] font-black ${isLenaHai ? 'text-red-600' : 'text-green-600'}`
      }, "Rs. ", formatAmount(Math.abs(contact.balance))), /*#__PURE__*/React.createElement("p", {
        className: `text-[8px] font-bold uppercase tracking-tighter ${isLenaHai ? 'text-red-600' : 'text-green-600'}`
      }, isLenaHai ? 'Lena Hai' : contact.balance > 0 ? 'Dena Hai' : 'Clear')));
    }))));
  }
  if (step === 'missingWA') {
    return /*#__PURE__*/React.createElement("div", {
      className: "fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-md flex items-end justify-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white w-full max-sm rounded-t-3xl shadow-2xl p-6 animate-in slide-in-from-bottom text-left"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-6"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setStep('selectContactWA'),
      className: "p-2 text-slate-400"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "ArrowLeft"
    })), /*#__PURE__*/React.createElement("h3", {
      className: "font-bold"
    }, "Add WhatsApp Number")), /*#__PURE__*/React.createElement("button", {
      onClick: () => setIsCheckoutModalOpen(false),
      className: "p-2 bg-slate-50 rounded-full"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "X"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-amber-50 p-4 rounded-2xl border border-amber-200 mb-2"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-xs font-bold text-amber-800"
    }, "WhatsApp number is missing for ", /*#__PURE__*/React.createElement("span", {
      className: "underline"
    }, missingWANumberContact?.name), "."), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] text-amber-600 mt-1 uppercase font-black"
    }, "Please add number in ledger to proceed.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
      className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block"
    }, "WhatsApp Number (11 Digits)"), /*#__PURE__*/React.createElement("input", {
      type: "tel",
      value: tempWANumber,
      onChange: e => setTempWANumber(e.target.value),
      placeholder: "e.g. 0300 1234567",
      maxLength: 11,
      className: "w-full bg-slate-50 border-2 border-slate-200 p-4 rounded-2xl font-bold outline-none focus:border-green-500 transition-all shadow-inner",
      autoFocus: true
    })), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 gap-3"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setStep('selectContactWA'),
      className: "py-4 rounded-2xl font-bold text-slate-600 bg-slate-100 uppercase text-xs tracking-widest active:scale-95 transition-all"
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        if (tempWANumber.length !== 11) {
          alert("Number poora 11 hindson ka hona chahiye.");
          return;
        }
        onComplete('Credit', missingWANumberContact, true, parseFloat(partialPaid) || 0, parseFloat(discountValue) || 0, discountType, discountAmount, tempWANumber, true);
      },
      disabled: tempWANumber.length < 11,
      className: `py-4 rounded-2xl font-bold text-white uppercase text-xs tracking-widest shadow-lg transition-all ${tempWANumber.length < 11 ? 'bg-slate-300' : 'bg-green-600 active:scale-95'}`
    }, "Save & Send")))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-md flex items-end justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-t-3xl shadow-2xl max-h-[95vh] flex flex-col p-4 animate-in slide-in-from-bottom text-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center mb-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg"
  }, isEditing ? 'Update Bill' : 'Review Items'), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, cart.length > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: clearCart,
    className: "text-red-500 font-bold text-[10px] uppercase px-3 py-1 bg-red-50 rounded-lg active:scale-90 shadow-sm"
  }, "Clear"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsCheckoutModalOpen(false),
    className: "p-2 bg-slate-50 rounded-full"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 overflow-y-auto space-y-3 no-scrollbar pb-6"
  }, cart.map(item => /*#__PURE__*/React.createElement("div", {
    key: item.id,
    className: "bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 pr-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-bold truncate"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 font-black uppercase tracking-widest"
  }, posMode === 'purchase' ? 'Stock Update' : posMode === 'sale_return' ? 'Sale Return' : posMode === 'purchase_return' ? 'Purchase Return' : 'Unit Sale')), /*#__PURE__*/React.createElement("button", {
    onClick: () => removeCartItem(item.id),
    className: "text-red-300 active:scale-90 p-1"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Trash2",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-12 gap-2 items-stretch"
  }, /*#__PURE__*/React.createElement("div", {
    className: "col-span-4 flex flex-col"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-1"
  }, "Unit Price"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center bg-white border border-slate-200 rounded-lg px-2 h-10 shadow-sm focus-within:border-blue-400 transition-all"
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "any",
    value: item.priceUsed === 0 ? "0" : item.priceUsed || "",
    onChange: e => handleInlineChange(item.id, 'price', e.target.value),
    className: "w-full bg-transparent outline-none font-bold text-xs text-blue-600",
    placeholder: "Rate"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "col-span-4 flex flex-col"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-1"
  }, "Quantity"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center bg-white border border-slate-200 rounded-lg h-10 shadow-sm overflow-hidden focus-within:border-blue-400 transition-all"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => updateCartQty(item.id, -1),
    className: "w-8 h-full bg-slate-50 text-slate-500 hover:bg-slate-100 border-r active:scale-90 transition-all font-bold"
  }, " - "), /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "any",
    value: item.quantity === 0 ? "0" : item.quantity || "",
    onChange: e => handleInlineChange(item.id, 'qty', e.target.value),
    className: "w-full bg-transparent outline-none font-bold text-xs text-center px-1",
    placeholder: "Qty"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => updateCartQty(item.id, 1),
    className: "w-8 h-full bg-slate-50 text-slate-500 hover:bg-slate-100 border-l active:scale-90 transition-all font-bold"
  }, " + "))), /*#__PURE__*/React.createElement("div", {
    className: "col-span-4 text-right flex flex-col justify-center"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-1"
  }, "Total"), /*#__PURE__*/React.createElement("p", {
    className: "font-black text-sm text-slate-900 truncate"
  }, "Rs. ", formatAmount(parseFloat(item.priceUsed) * parseFloat(item.quantity) || 0)))), posMode === 'purchase' && /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditingPriceItemId(editingPriceItemId === item.id ? null : item.id),
    className: "flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 w-fit px-3 py-1 rounded-full border border-orange-100 active:scale-95"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Settings2",
    size: 10
  }), " Edit Retail/Wholesale Prices "), posMode === 'purchase' && editingPriceItemId === item.id && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-2 p-3 bg-white rounded-lg border-2 border-orange-100 animate-in slide-in-from-top duration-200"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase block mb-1"
  }, "New Sale Price"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "any",
    value: item.salePrice || "",
    onChange: e => handleInlineChange(item.id, 'salePrice', e.target.value),
    className: "w-full h-10 bg-slate-50 border border-slate-200 px-2 rounded text-xs font-bold outline-none focus:border-orange-400"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[8px] font-black text-slate-400 uppercase block mb-1"
  }, "New Wholesale Price"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "any",
    value: item.wholesalePrice || "",
    onChange: e => handleInlineChange(item.id, 'wholesalePrice', e.target.value),
    className: "w-full h-10 bg-slate-50 border border-slate-200 px-2 rounded text-xs font-bold outline-none focus:border-orange-400"
  })))))), /*#__PURE__*/React.createElement("div", {
    className: "bg-red-50 p-4 rounded-xl border border-red-100 mb-3 space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-red-600 uppercase tracking-widest"
  }, "Apply Discount"), /*#__PURE__*/React.createElement("div", {
    className: "flex bg-white rounded-lg p-1 border shadow-sm"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDiscountType('flat'),
    className: `px-3 py-1 text-[10px] font-bold rounded ${discountType === 'flat' ? 'bg-red-600 text-white' : 'text-slate-400'}`
  }, " Rs. "), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDiscountType('percent'),
    className: `px-3 py-1 text-[10px] font-bold rounded ${discountType === 'percent' ? 'bg-red-600 text-white' : 'text-slate-400'}`
  }, " % "))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 relative"
  }, /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "any",
    value: discountValue || "",
    onChange: e => setDiscountValue(e.target.value),
    placeholder: `Enter ${discountType === 'flat' ? 'Amount' : 'Percentage'}...`,
    className: "w-full h-12 bg-white border-2 border-red-100 px-4 rounded-xl font-bold text-sm outline-none focus:border-red-400 shadow-inner"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute right-4 top-3.5 opacity-30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Tag",
    size: 16
  }))), discountAmount > 0 && /*#__PURE__*/React.createElement("div", {
    className: "bg-white px-3 py-2 rounded-lg border border-red-200 text-right min-w-[100px] shadow-sm"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-black text-red-400 uppercase tracking-tighter"
  }, "Save"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-black text-red-600"
  }, "-Rs.", formatAmount(discountAmount))))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 space-y-2 shrink-0 border-t pt-4"
  }, isCartInvalid && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-red-500 text-center animate-pulse mb-2"
  }, " Rate aur Quantity check karein. "), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center shadow-lg"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black text-white/50 uppercase tracking-[0.2em]"
  }, "Final Net Amount"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-black"
  }, "Rs. ", formatAmount(finalNetTotal))), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-white/50"
  }, totalQty, " Items"), discountAmount > 0 && /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] font-bold text-red-400 line-through opacity-60"
  }, "Rs. ", formatAmount(cartTotal)))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 mt-2 items-stretch"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => isWaToggled ? setStep('waCashPhone') : triggerComplete('Cash'),
    disabled: isCartInvalid || cart.length === 0,
    className: `flex-1 p-4 rounded-xl font-bold active:scale-95 transition-all shadow-md uppercase text-xs tracking-widest flex flex-row items-center justify-center gap-2 ${isCartInvalid ? 'bg-slate-300 text-slate-500' : isWaToggled ? 'bg-emerald-600 text-white' : 'bg-green-600 text-white'}`
  }, isWaToggled && /*#__PURE__*/React.createElement("img", {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/120px-WhatsApp.svg.png",
    className: "w-4 h-4 object-contain brightness-0 invert",
    alt: "WA"
  }), /*#__PURE__*/React.createElement("span", null, isEditing ? 'Update Cash' : posMode.includes('return') ? 'Return Cash' : 'Full Cash')), isWhatsappEnabled && !isEditing && /*#__PURE__*/React.createElement("button", {
    onClick: () => setWaTogglePref(!waTogglePref),
    className: `w-14 rounded-xl flex items-center justify-center shadow-md active:scale-90 transition-all border-2 shrink-0 overflow-hidden ${isWaToggled ? 'bg-white border-green-500' : 'bg-slate-50 border-slate-200'}`
  }, /*#__PURE__*/React.createElement("img", {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/120px-WhatsApp.svg.png",
    alt: "WhatsApp",
    className: `w-8 h-8 object-contain transition-all ${isWaToggled ? 'opacity-100' : 'opacity-30 grayscale'}`
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => isWaToggled ? setStep('selectContactWA') : setStep('selectContact'),
    disabled: isCartInvalid || cart.length === 0,
    className: `flex-1 p-4 rounded-xl font-bold active:scale-95 transition-all shadow-md uppercase text-xs tracking-widest flex flex-row items-center justify-center gap-2 ${isCartInvalid ? 'bg-slate-300 text-slate-500' : isWaToggled ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'}`
  }, isWaToggled && /*#__PURE__*/React.createElement("img", {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/120px-WhatsApp.svg.png",
    className: "w-4 h-4 object-contain brightness-0 invert",
    alt: "WA"
  }), /*#__PURE__*/React.createElement("span", null, isEditing ? 'Update Ledger' : posMode.includes('return') ? 'Return in Ledger' : 'Udhaar'))))));
};

// --- AUTHENTICATION COMPONENTS ---
const Login = ({
  onLogin
}) => {
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setAuthError('');
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      onLogin();
    } catch (error) {
      console.error(error);
      setAuthError("Google Sign In Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };
  const handleEmailSubmit = async e => {
    e.preventDefault();
    setAuthError('');
    if (!email || !password) {
      setAuthError("Email aur Password dono zaroori hain.");
      return;
    }
    setEmailLoading(true);
    try {
      if (isSignUp) {
        await auth.createUserWithEmailAndPassword(email, password);
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
      onLogin();
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError("Email ya password ghalat hai. Dobara check karein.");
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError("Yeh email pehle se register hai. Sign In karein.");
      } else if (error.code === 'auth/weak-password') {
        setAuthError("Password kam az kam 6 characters ka hona chahiye.");
      } else {
        setAuthError("Auth Error: " + error.message);
      }
    } finally {
      setEmailLoading(false);
    }
  };
  const submitForgot = async e => {
    e.preventDefault();
    if (!forgotEmail) {
      alert("Pehle apna email enter karein.");
      return;
    }
    setResetLoading(true);
    try {
      await auth.sendPasswordResetEmail(forgotEmail);
      alert("Password reset link " + forgotEmail + " par bhej diya gaya hai. Apna inbox check karein.");
      setShowForgotModal(false);
      setForgotEmail('');
    } catch (error) {
      alert("Reset Error: " + error.message);
    } finally {
      setResetLoading(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800 text-left overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0,transparent_100%)] pointer-events-none"
  }), /*#__PURE__*/React.createElement("div", {
    className: "w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500 relative z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center mt-2"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "text-5xl font-black tracking-tighter text-slate-900 mb-2"
  }, "Dukan", /*#__PURE__*/React.createElement("span", {
    className: "text-blue-600"
  }, "360"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white border border-slate-200 p-8 rounded-[2rem] shadow-2xl"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-bold mb-6 text-center text-slate-800"
  }, isSignUp ? 'Create a new account' : 'Welcome Back'), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleEmailSubmit,
    className: "space-y-4 mb-3"
  }, authError && /*#__PURE__*/React.createElement("div", {
    className: "bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100 flex items-start gap-2 animate-in fade-in"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "AlertCircle",
    size: 16,
    className: "shrink-0 mt-0.5"
  }), /*#__PURE__*/React.createElement("span", null, authError)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1"
  }, "Email"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none font-bold text-sm focus:border-blue-500 transition-all",
    placeholder: "Enter your email"
  })), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1"
  }, "Password"), /*#__PURE__*/React.createElement("input", {
    type: showPassword ? "text" : "password",
    value: password,
    onChange: e => setPassword(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 p-3 pr-10 rounded-xl outline-none font-bold text-sm focus:border-blue-500 transition-all",
    placeholder: isSignUp ? "Create a password" : "Enter your password"
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowPassword(!showPassword),
    className: "absolute right-3 bottom-3 text-slate-400 hover:text-blue-600 transition-colors outline-none"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: showPassword ? "EyeOff" : "Eye",
    size: 18
  }))), !isSignUp && /*#__PURE__*/React.createElement("div", {
    className: "text-right -mt-1 mb-2"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowForgotModal(true),
    className: "text-[10px] font-bold text-blue-600 hover:underline outline-none"
  }, "Forgot Password?")), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: loading,
    className: "w-full bg-blue-600 text-white p-4 justify-center rounded-2xl font-bold text-sm shadow-lg active:scale-[0.98] transition-all flex items-center gap-2"
  }, loading ? /*#__PURE__*/React.createElement("span", {
    className: "animate-spin border-2 border-white/20 border-t-white rounded-full w-5 h-5"
  }) : isSignUp ? 'Sign Up' : 'Sign In')), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: handleGoogleSignIn,
    disabled: loading,
    className: "w-full bg-black text-white p-4 rounded-2xl font-bold text-sm shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-black hover:bg-slate-900"
  }, /*#__PURE__*/React.createElement("svg", {
    className: "w-5 h-5",
    viewBox: "0 0 24 24"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z",
    fill: "#4285F4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z",
    fill: "#34A853"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z",
    fill: "#FBBC05"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z",
    fill: "#EA4335"
  })), /*#__PURE__*/React.createElement("span", null, "Continue with Google")), /*#__PURE__*/React.createElement("p", {
    className: "text-center text-xs font-bold text-slate-500 mt-6 pt-4 border-t border-slate-100"
  }, isSignUp ? "Already have an account? " : "Don't have an account? ", /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setIsSignUp(!isSignUp),
    className: "text-blue-600 hover:underline outline-none"
  }, isSignUp ? "Sign In" : "Sign Up")))), showForgotModal && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in duration-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-500 ring-4 ring-blue-50/50"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Key",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-xl text-center text-slate-800 mb-2"
  }, "Reset Password"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-center text-slate-500 mb-6 font-medium leading-relaxed"
  }, "Apna email darj karein, hum aapko password reset karne ka link bhejenge."), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitForgot,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1"
  }, "Email Address"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: forgotEmail,
    onChange: e => setForgotEmail(e.target.value),
    className: "w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none font-bold text-sm focus:border-blue-500 transition-all",
    placeholder: "Enter your email",
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3 mt-4"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowForgotModal(false),
    className: "py-3 bg-slate-100 rounded-xl font-bold text-slate-500 text-xs uppercase tracking-widest active:scale-95 transition-all"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    disabled: resetLoading,
    className: "py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 flex items-center justify-center transition-all"
  }, resetLoading ? /*#__PURE__*/React.createElement("span", {
    className: "animate-spin border-2 border-white/20 border-t-white rounded-full w-4 h-4"
  }) : 'Send Link'))))));
};
const AppContent = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) setCurrentUserEmail(user.email);
    });
    return () => unsubscribe();
  }, []);

  // --- OFFLINE STATE ---
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [posMode, setPosMode] = useState('sale');
  const [isWholesaleMode, setIsWholesaleMode] = useState(false);
  const mainScrollRef = useRef(null);

  // --- SCROLL TO HIDE HEADER STATE ---
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollY = useRef(0);
  const isToggling = useRef(false);
  useEffect(() => {
    setShowHeader(true);
    lastScrollY.current = 0;
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
  }, [activeTab]);
  const handleGlobalScroll = useCallback(e => {
    if (isToggling.current) return; // Glitch rokne ke liye: animation complete hone ka wait karein

    const target = e.target;
    // Sirf main containers par scroll track karein jin ki height zyada ho
    if (target.scrollHeight - target.clientHeight < 50) return;
    const currentScrollY = target.scrollTop;

    // Screen ke bilkul top par hamesha dikhayein
    if (currentScrollY <= 10) {
      if (!showHeader) {
        setShowHeader(true);
        isToggling.current = true;
        setTimeout(() => isToggling.current = false, 400);
      }
      lastScrollY.current = currentScrollY;
      return;
    }
    if (currentScrollY > lastScrollY.current + 20) {
      // Neeche scroll karne par chupayein
      if (showHeader) {
        setShowHeader(false);
        isToggling.current = true;
        setTimeout(() => isToggling.current = false, 400); // 400ms delay to prevent bounce glitch
      }
      lastScrollY.current = currentScrollY;
    } else if (currentScrollY < lastScrollY.current - 20) {
      // Upar scroll karne par wapis layein
      if (!showHeader) {
        setShowHeader(true);
        isToggling.current = true;
        setTimeout(() => isToggling.current = false, 400);
      }
      lastScrollY.current = currentScrollY;
    }
  }, [showHeader]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [isEditContactModalOpen, setIsEditContactModalOpen] = useState(false);
  const [isDeleteTxModalOpen, setIsDeleteTxModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isLedgerActionModalOpen, setIsLedgerActionModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false); // New Modal for Blocked Actions
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [contactErrors, setContactErrors] = useState({});
  const [backupClicks, setBackupClicks] = useState(0);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const clickTimeoutRef = useRef(null);
  const [ledgerActionType, setLedgerActionType] = useState('receipt');
  const [ledgerAmount, setLedgerAmount] = useState("");
  const [ledgerDesc, setLedgerDesc] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(getIsoDate());
  const [txToDelete, setTxToDelete] = useState(null);
  const [accountToDeleteId, setAccountToDeleteId] = useState(null);
  const [editingTxId, setEditingTxId] = useState(null);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [contactToEdit, setContactToEdit] = useState(null);
  const [contactListTab, setContactListTab] = useState('customer');
  const [openingBalType, setOpeningBalType] = useState('receivable'); // New State for Balance Type
  const [settingsView, setSettingsView] = useState('main');
  const [selectedViewTx, setSelectedViewTx] = useState(null);
  const [stockFilter, setStockFilter] = useState('all');

  // Reset scroll on internal view changes (e.g. Opening specific ledger)
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [selectedLedger, settingsView]);
  const [stockError, setStockError] = useState(null);
  const [dashFilter, setDashFilter] = useState('today');
  const [dashCustomStart, setDashCustomStart] = useState(getIsoDate());
  const [dashCustomEnd, setDashCustomEnd] = useState(getIsoDate());
  const [posQuery, setPosQuery] = useState("");
  const [posActiveCategory, setPosActiveCategory] = useState("all");
  const [prodQuery, setProdQuery] = useState("");
  const [prodActiveCategory, setProdActiveCategory] = useState("all");
  const [productsList, setProductsList] = useLocalStorage('gs_v4_products', []);
  const [transactionsList, setTransactionsList] = useLocalStorage('gs_v4_txs', []);
  const [contactsList, setContactsList] = useLocalStorage('gs_v4_contacts', []);
  const [shopName, setShopName] = useLocalStorage('gs_v4_shop_name', 'Your Business Name Here');
  const [ownerName, setOwnerName] = useLocalStorage('gs_v4_owner_name', 'Shop Owner');
  const [shopPhone, setShopPhone] = useLocalStorage('gs_v4_shop_phone', '');
  const [shopAddress, setShopAddress] = useLocalStorage('gs_v4_shop_address', '');
  const [shopLogo, setShopLogo] = useLocalStorage('gs_v4_shop_logo', null);
  const [isWholesaleEnabled, setIsWholesaleEnabled] = useLocalStorage('gs_v4_wholesale_enabled', false);
  const [isWhatsappEnabled, setIsWhatsappEnabled] = useLocalStorage('gs_v4_wa_enabled', false);
  const [isInvoicePreviewEnabled, setIsInvoicePreviewEnabled] = useLocalStorage('gs_v4_preview_enabled', false);
  const [billWidth, setBillWidth] = useLocalStorage('gs_v4_bill_width', '58mm');
  const [isRomanUrduEnabled, setIsRomanUrduEnabled] = useLocalStorage('gs_v4_roman_urdu_enabled', true);
  const [invCounter, setInvCounter] = useLocalStorage('gs_v4_inv_counter', 1);
  const [paymentDetails, setPaymentDetails] = useLocalStorage('gs_v4_payment_details', '');
  const [paymentQR, setPaymentQR] = useLocalStorage('gs_v4_payment_qr', null);
  const [categories, setCategories] = useLocalStorage('gs_v4_categories', []);
  const [productCategoryId, setProductCategoryId] = useState("all");

  // --- TEMP STATE FOR PROFILE EDITING ---
  const [tempShopName, setTempShopName] = useState("");
  const [tempOwnerName, setTempOwnerName] = useState("");
  const [tempShopPhone, setTempShopPhone] = useState("");
  const [tempShopAddress, setTempShopAddress] = useState("");
  const [tempShopLogo, setTempShopLogo] = useState(null);
  const [tempPaymentDetails, setTempPaymentDetails] = useState("");
  const [tempPaymentQR, setTempPaymentQR] = useState(null);

  // --- BLUETOOTH PRINTER STATE ---
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const [connectedPrinterName, setConnectedPrinterName] = useState("");
  const [isPrinterConnecting, setIsPrinterConnecting] = useState(false);

  // --- SUCCESS ANIMATION STATE ---
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const triggerSuccess = () => {
    setShowSuccessAnimation(true);
    playBeep();
    setTimeout(() => setShowSuccessAnimation(false), 900); // < 1 second animation
  };
  const handleSecretClick = () => {
    setBackupClicks(prev => {
      const newVal = prev + 1;
      if (newVal >= 10) {
        setIsBackupModalOpen(true);
        return 0;
      }
      return newVal;
    });
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => setBackupClicks(0), 1000);
  };
  const handleExportBackup = () => {
    const backupData = {};
    // Sirf current user ka data backup hoga
    const userPrefix = auth.currentUser ? `${auth.currentUser.uid}_` : '';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(userPrefix) && key.includes('gs_v4_')) {
        backupData[key] = localStorage.getItem(key);
      }
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Dukan360_Backup_${getIsoDate()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  const handleImportBackup = event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        for (const key in data) {
          localStorage.setItem(key, data[key]);
        }
        alert("Backup successfully restore ho gaya hai! App ab reload hogi.");
        window.location.reload();
      } catch (err) {
        alert("Backup file kharab hai ya format theek nahi.");
      }
    };
    reader.readAsText(file);
  };

  // New state for persisting card template selection
  const [cardTemplateIndex, setCardTemplateIndex] = useLocalStorage('gs_v4_card_template_index', 0);

  // --- LICENSE & SECURITY SYSTEM ---
  const [deviceId] = useLocalStorage('gs_v4_device_id', 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase());
  const [licenseKeyInput, setLicenseKeyInput] = useState("");

  // Simple Security Hash (Client Side)
  const SALT = "PAK_POS_SECURE_SALT_786";
  const generateHash = str => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).toUpperCase();
  };
  const validateLicenseKey = (key, currentDeviceId) => {
    try {
      const parts = key.split('-');
      if (parts[0] !== 'LIC' || parts.length !== 3) return null;

      // Add padding back if needed for atob
      let payload = parts[1];
      while (payload.length % 4) payload += '=';
      const expiryStr = atob(payload);
      const signature = parts[2];
      const expectedSignature = generateHash(currentDeviceId + expiryStr + SALT);
      if (signature === expectedSignature) {
        return expiryStr; // Valid Date String
      }
      return null;
    } catch (e) {
      return null;
    }
  };
  const handleLicenseActivation = () => {
    const result = validateLicenseKey(licenseKeyInput.trim(), deviceId);
    if (result) {
      const newExpiry = result;
      // Check if already expired
      if (newExpiry < getIsoDate()) {
        alert("Yeh License Key expire ho chuka hai.");
        return;
      }
      setSubscription({
        status: 'premium',
        startDate: getIsoDate(),
        expiryDate: newExpiry
      });
      alert("Mubarak ho! Premium Plan activate ho gaya hai.");
      setLicenseKeyInput("");
      setSettingsView('main');
    } else {
      alert("Ghalat License Key. Baraye meherbani Admin se rabta karein.");
    }
  };

  // --- PREMIUM SUBSCRIPTION LOGIC ---
  const [subscription, setSubscription] = useLocalStorage('gs_v4_subscription_data', {
    status: 'trial',
    // 'trial' or 'premium'
    startDate: getIsoDate(),
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days default
  });
  const isSubscriptionActive = useMemo(() => {
    const today = getIsoDate();
    return subscription.expiryDate >= today;
  }, [subscription]);
  const daysLeft = useMemo(() => {
    const today = new Date(getIsoDate());
    const expiry = new Date(subscription.expiryDate);
    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [subscription]);
  const checkPermission = () => {
    if (!isSubscriptionActive) {
      setIsPremiumModalOpen(true);
      return false;
    }
    return true;
  };
  // ----------------------------------

  // Bluetooth Printer Connect Function
  const handleConnectPrinter = async () => {
    if (!navigator.bluetooth) {
      alert("Aapka browser Bluetooth support nahi karta. Chrome istemal karein.");
      return;
    }
    setIsPrinterConnecting(true);
    try {
      // Note: We use acceptAllDevices because generic thermal printers use different UUIDs.
      // However, we now enforce a real GATT connection to ensure it's a valid device.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // Common printer service
      });

      // CRITICAL FIX: Actually attempt to connect to the GATT server
      // This prevents showing "Connected" for random devices that are not reachable or supported
      const server = await device.gatt.connect();
      setConnectedPrinterName(device.name || "Bluetooth Printer");
      setIsPrinterConnected(true);
      device.addEventListener('gattserverdisconnected', () => {
        setIsPrinterConnected(false);
        setConnectedPrinterName("");
        // Optional: alert("Printer disconnected");
      });
    } catch (error) {
      console.log("Connection failed: ", error);
      // Only show alert if it wasn't a user cancellation
      if (error.name !== 'NotFoundError') {
        alert("Printer connect nahi ho saka. Make sure printer ON hai.");
      }
      setIsPrinterConnected(false);
    } finally {
      setIsPrinterConnecting(false);
    }
  };
  useEffect(() => {
    if (!isWholesaleEnabled) setIsWholesaleMode(false);
  }, [isWholesaleEnabled]);

  // Auto-switch opening balance type based on tab and reset on modal open
  useEffect(() => {
    setOpeningBalType(contactListTab === 'customer' ? 'receivable' : 'payable');
  }, [contactListTab, isAddContactModalOpen]);

  // --- Dynamic Cart Price Update ---
  useEffect(() => {
    setCart(prevCart => {
      let hasChanges = false;
      const newCart = prevCart.map(item => {
        const product = productsList.find(p => p.id === item.id);
        if (!product) return item;
        let newPrice = 0;
        if (posMode === 'purchase' || posMode === 'purchase_return') {
          newPrice = parseFloat(product.purchasePrice) || 0;
        } else {
          // Sale Mode or Sale Return Mode
          if (isWholesaleMode && (parseFloat(product.wholesalePrice) || 0) > 0) {
            newPrice = parseFloat(product.wholesalePrice) || 0;
          } else {
            newPrice = parseFloat(product.salePrice) || 0;
          }
        }
        if (item.priceUsed !== newPrice) {
          hasChanges = true;
          return {
            ...item,
            priceUsed: newPrice
          };
        }
        return item;
      });
      return hasChanges ? newCart : prevCart;
    });
  }, [posMode, isWholesaleMode, productsList]);
  const [itemName, setItemName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [productImage, setProductImage] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const activeContact = useMemo(() => selectedLedger ? contactsList.find(c => c.id === selectedLedger.id) : null, [selectedLedger, contactsList]);
  const cartTotal = useMemo(() => cart.reduce((a, b) => a + (parseFloat(b.priceUsed) || 0) * (parseFloat(b.quantity) || 0), 0), [cart]);
  const resetProductForm = () => {
    setItemName("");
    setBarcode("");
    setPurchasePrice("");
    setSalePrice("");
    setWholesalePrice("");
    setOpeningStock("");
    setMinStock("");
    setExpiryDate("");
    setProductImage(null);
    setEditingProduct(null);
    setProductCategoryId("all");
  };
  const navigateToTab = (tabName, initialFilter = null) => {
    setPosQuery("");
    setPosActiveCategory("all");
    setProdQuery("");
    setProdActiveCategory("all");
    setStockFilter(initialFilter || "all");
    if (tabName !== 'dashboard') setDashFilter("today");
    if (tabName === 'ledgers') {
      setSelectedLedger(null);
      setEditingTxId(null);
      setContactListTab(initialFilter || 'customer');
    } else if (tabName === 'settings') setSettingsView('main');else if (tabName === 'products') {
      if (!initialFilter) resetProductForm();
    } else if (tabName === 'pos') {
      setPosMode('sale');
      if (editingTxId) setEditingTxId(null);
    }
    setActiveTab(tabName);
  };
  const dashboardStats = useMemo(() => {
    const labelSuffix = {
      today: 'Today',
      yesterday: 'Yesterday',
      month: 'Month',
      custom: 'Range'
    }[dashFilter];
    const today = getIsoDate();
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterday = getIsoDate(yesterdayObj);
    const currentMonth = today.substring(0, 7);
    const filteredTx = transactionsList.filter(t => {
      if (dashFilter === 'today') return t.date === today;
      if (dashFilter === 'yesterday') return t.date === yesterday;
      if (dashFilter === 'month') return t.date.startsWith(currentMonth);
      if (dashFilter === 'custom') return t.date >= dashCustomStart && t.date <= dashCustomEnd;
      return true;
    });
    const sales = filteredTx.filter(t => t.type === 'sale');
    const purchases = filteredTx.filter(t => t.type === 'purchase');
    const receipts = filteredTx.filter(t => t.type === 'receipt');
    const payments = filteredTx.filter(t => t.type === 'payment');
    const expenses = filteredTx.filter(t => t.type === 'expense');
    const saleReturns = filteredTx.filter(t => t.type === 'sale_return');
    const purchaseReturns = filteredTx.filter(t => t.type === 'purchase_return');
    const srCashAmt = saleReturns.reduce((a, b) => a + (parseFloat(b.paidAmount) || 0), 0);
    const srCreditAmt = saleReturns.reduce((a, b) => a + (parseFloat(b.amount) - (parseFloat(b.paidAmount) || 0)), 0);
    const prCashAmt = purchaseReturns.reduce((a, b) => a + (parseFloat(b.paidAmount) || 0), 0);
    const prCreditAmt = purchaseReturns.reduce((a, b) => a + (parseFloat(b.amount) - (parseFloat(b.paidAmount) || 0)), 0);
    const cashSaleRaw = sales.reduce((a, b) => a + (parseFloat(b.paidAmount) || 0), 0);
    const creditSaleRaw = sales.reduce((a, b) => a + (parseFloat(b.amount) - (parseFloat(b.paidAmount) || 0)), 0);
    const cashPurchaseRaw = purchases.reduce((a, b) => a + (parseFloat(b.paidAmount) || 0), 0);
    const creditPurchaseRaw = purchases.reduce((a, b) => a + (parseFloat(b.amount) - (parseFloat(b.paidAmount) || 0)), 0);
    const wasoolCashRaw = receipts.reduce((a, b) => a + b.amount, 0);
    const adaCashRaw = payments.reduce((a, b) => a + b.amount, 0);
    const expensesAmt = expenses.reduce((a, b) => a + b.amount, 0);
    const displayPaymentAmount = adaCashRaw + cashPurchaseRaw;
    const cashSaleNet = cashSaleRaw - srCashAmt;
    const creditSaleNet = creditSaleRaw - srCreditAmt;
    const totalSaleNet = cashSaleNet + creditSaleNet;
    const cashPurchaseNet = cashPurchaseRaw - prCashAmt;
    const creditPurchaseNet = creditPurchaseRaw - prCreditAmt;
    const totalPurchaseNet = cashPurchaseNet + creditPurchaseNet;
    const totalCashIn = cashSaleRaw + wasoolCashRaw + prCashAmt;
    const totalCashOut = cashPurchaseRaw + adaCashRaw + expensesAmt + srCashAmt;
    const closingBalance = totalCashIn - totalCashOut;
    const saleProfit = sales.reduce((acc, t) => {
      const txProfit = (t.items || []).reduce((sum, item) => {
        const cost = parseFloat(item.costUsedForProfit) || 0;
        return sum + (parseFloat(item.priceUsed) - cost) * parseFloat(item.quantity);
      }, 0);
      return acc + (txProfit - (t.discountAmount || 0));
    }, 0);
    const returnProfit = saleReturns.reduce((acc, t) => {
      const txProfit = (t.items || []).reduce((sum, item) => {
        const cost = parseFloat(item.costUsedForProfit) || 0;
        return sum + (parseFloat(item.priceUsed) - cost) * parseFloat(item.quantity);
      }, 0);
      return acc + (txProfit - (t.discountAmount || 0));
    }, 0);
    const netProfit = saleProfit - returnProfit;
    const totalStockCostValue = productsList.reduce((a, b) => {
      const currentAvgCost = parseFloat(b.avgCost) || parseFloat(b.purchasePrice) || 0;
      return a + parseFloat(b.openingStock) * currentAvgCost;
    }, 0);
    return {
      totals: {
        totalSale: `Rs. ${formatAmount(totalSaleNet)}`,
        totalPurchase: `Rs. ${formatAmount(totalPurchaseNet)}`
      },
      financials: [{
        label: `Cash Sale ${labelSuffix}`,
        romanUrdu: "Naqd farokht (Net)",
        value: `Rs. ${formatAmount(cashSaleNet)}`,
        bg: 'bg-green-50',
        labelColor: 'text-green-700'
      }, {
        label: `Credit Sale ${labelSuffix}`,
        romanUrdu: "Udhaar farokht (Net)",
        value: `Rs. ${formatAmount(creditSaleNet)}`,
        bg: 'bg-amber-50',
        labelColor: 'text-amber-700'
      }, {
        label: `Cash Purchase ${labelSuffix}`,
        romanUrdu: "Naqd khareedari (Net)",
        value: `Rs. ${formatAmount(cashPurchaseNet)}`,
        bg: 'bg-blue-50',
        labelColor: 'text-blue-700'
      }, {
        label: `Credit Purchase ${labelSuffix}`,
        romanUrdu: "Udhaar khareedari (Net)",
        value: `Rs. ${formatAmount(creditPurchaseNet)}`,
        bg: 'bg-indigo-50',
        labelColor: 'text-indigo-700'
      }, {
        label: `Recovery ${labelSuffix}`,
        romanUrdu: "Naqd wasooli",
        value: `Rs. ${formatAmount(wasoolCashRaw)}`,
        bg: 'bg-emerald-50',
        labelColor: 'text-emerald-700'
      }, {
        label: `Payment ${labelSuffix}`,
        romanUrdu: "Naqd adaigi",
        value: `Rs. ${formatAmount(displayPaymentAmount)}`,
        bg: 'bg-rose-50',
        labelColor: 'text-rose-700'
      }, {
        label: `Expense ${labelSuffix}`,
        romanUrdu: "Akhrajaat",
        value: `Rs. ${formatAmount(expensesAmt)}`,
        bg: 'bg-red-50',
        labelColor: 'text-red-700'
      }, {
        label: `Net Profit ${labelSuffix}`,
        romanUrdu: "Munafa (Baghair Kharch)",
        value: `Rs. ${formatAmount(netProfit)}`,
        bg: 'bg-teal-50',
        labelColor: 'text-teal-700'
      }, {
        label: `Cash In Hand ${labelSuffix}`,
        romanUrdu: "Dukan mein bacha cash",
        value: `Rs. ${formatAmount(closingBalance)}`,
        bg: 'bg-blue-50',
        labelColor: 'text-blue-900'
      }],
      ledgers: [{
        label: 'Receivable',
        urduLabel: 'Aap ne lena hai',
        value: `Rs. ${formatAmount(contactsList.filter(c => !c.isInactive && c.balance < 0).reduce((a, b) => a + Math.abs(b.balance), 0))}`,
        bg: 'bg-emerald-100',
        labelColor: 'text-emerald-800',
        target: 'viewCustomers'
      }, {
        label: 'Payable',
        urduLabel: 'Aap ne dena hai',
        value: `Rs. ${formatAmount(contactsList.filter(c => !c.isInactive && c.balance > 0).reduce((a, b) => a + Math.abs(b.balance), 0))}`,
        bg: 'bg-rose-100',
        labelColor: 'text-rose-800',
        target: 'viewSuppliers'
      }],
      inventory: [{
        label: 'Total Items',
        romanUrdu: "Kul saamaan",
        value: productsList.length,
        bg: 'bg-slate-100',
        labelColor: 'text-slate-600',
        target: 'products',
        filter: 'all'
      }, {
        label: 'Low Stock',
        romanUrdu: "Kam stock wala maal",
        value: productsList.filter(p => p.openingStock > 0 && p.openingStock <= (p.minStock || 0)).length,
        bg: 'bg-orange-50',
        labelColor: 'text-orange-700',
        target: 'products',
        filter: 'lowstock'
      }, {
        label: 'Out of Stock',
        romanUrdu: "Jo maal khatam hai",
        value: productsList.filter(p => p.openingStock <= 0).length,
        bg: 'bg-red-100',
        labelColor: 'text-red-700',
        target: 'products',
        filter: 'outofstock'
      }, {
        label: 'Near Expiry (15d)',
        romanUrdu: "Kharaab honay wala maal",
        value: productsList.filter(p => isNearExpiry(p.expiryDate)).length,
        bg: 'bg-orange-100',
        labelColor: 'text-orange-700',
        target: 'products',
        filter: 'nearexpiry'
      }],
      valuation: [{
        label: 'Total (Cost)',
        romanUrdu: "Dukan mein kul sarmaya",
        value: `Rs. ${formatAmount(totalStockCostValue)}`,
        bg: 'bg-indigo-50',
        labelColor: 'text-indigo-700'
      }, {
        label: 'Total (Wholesale)',
        romanUrdu: "Kul Wholesale Qeemat",
        value: `Rs. ${formatAmount(productsList.reduce((a, b) => a + parseFloat(b.openingStock) * (parseFloat(b.wholesalePrice) || 0), 0))}`,
        bg: 'bg-orange-50',
        labelColor: 'text-orange-700'
      }, {
        label: 'Total (Sale)',
        romanUrdu: "Kul Farokht Qeemat",
        value: `Rs. ${formatAmount(productsList.reduce((a, b) => a + parseFloat(b.openingStock) * parseFloat(b.salePrice), 0))}`,
        bg: 'bg-emerald-50',
        labelColor: 'text-emerald-700'
      }]
    };
  }, [transactionsList, productsList, contactsList, dashFilter, dashCustomStart, dashCustomEnd]);
  const addToCart = (p, appliedPrice) => {
    const isOutgoing = posMode === 'sale' || posMode === 'purchase_return';
    if (isOutgoing && p.openingStock <= 0) {
      setStockError(`"${p.name}" ka stock khatam hai.`);
      return;
    }
    playClickSound();
    const existing = cart.find(item => item.id === p.id);
    if (existing) {
      const newQty = parseFloat(existing.quantity) + 1;
      if (isOutgoing && newQty > p.openingStock) {
        setStockError(`Stock sirf ${p.openingStock} bacha hai.`);
        return;
      }
      setCart(cart.map(item => item.id === p.id ? {
        ...item,
        quantity: newQty,
        priceUsed: appliedPrice
      } : item));
    } else {
      setCart([...cart, {
        ...p,
        quantity: 1,
        priceUsed: appliedPrice
      }]);
    }
  };
  const updateCartQty = (id, delta) => {
    playClickSound();
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (!existing) return prev;
      const newQty = (parseFloat(existing.quantity) || 0) + delta;
      if (newQty < 1) return prev.filter(item => item.id !== id);
      const isOutgoing = posMode === 'sale' || posMode === 'purchase_return';
      if (isOutgoing && delta > 0 && newQty > existing.openingStock) {
        setStockError(`Stock sirf ${existing.openingStock} bacha hai.`);
        return prev;
      }
      return prev.map(item => item.id === id ? {
        ...item,
        quantity: newQty
      } : item);
    });
  };
  const removeCartItem = id => {
    playClickSound();
    setCart(prev => prev.filter(item => item.id !== id));
  };
  const clearCart = () => {
    if (window.confirm('Clear cart?')) {
      setCart([]);
      setIsCheckoutModalOpen(false);
    }
  };
  const reverseTransaction = useCallback(txId => {
    const target = transactionsList.find(t => t.id === txId);
    if (!target) return;
    if (target.items) {
      setProductsList(productsList.map(p => {
        const itemInTx = target.items.find(i => i.id === p.id);
        if (itemInTx) {
          const qty = parseFloat(itemInTx.quantity);
          let stockAdj = 0;
          if (target.type === 'sale') stockAdj = qty;else if (target.type === 'purchase') stockAdj = -qty;else if (target.type === 'sale_return') stockAdj = -qty;else if (target.type === 'purchase_return') stockAdj = qty;
          return {
            ...p,
            openingStock: parseFloat(p.openingStock) + stockAdj
          };
        }
        return p;
      }));
    }
    if (target.contactId) {
      setContactsList(prev => prev.map(c => {
        if (c.id === target.contactId) {
          const dueAmt = target.amount - (target.paidAmount || 0);
          let balanceChange = 0;
          if (target.type === 'sale') balanceChange = dueAmt;else if (target.type === 'purchase') balanceChange = -dueAmt;else if (target.type === 'receipt') balanceChange = -target.amount;else if (target.type === 'payment') balanceChange = target.amount;else if (target.type === 'sale_return') balanceChange = -dueAmt;else if (target.type === 'purchase_return') balanceChange = dueAmt;else if (target.type === 'Opening Balance') {
            const isLenaHai = target.description && target.description.includes('Lena hai');
            balanceChange = isLenaHai ? target.amount : -target.amount;
          } else {
            balanceChange = target.amount;
          }
          return {
            ...c,
            balance: c.balance + balanceChange
          };
        }
        return c;
      }));
    }
  }, [transactionsList, productsList]);
  const handleCheckout = (paymentType, contact = null, requestWA = false, partialPaidAmount = 0, discountValue = 0, discountType = 'flat', discountAmountCalculated = 0, waNumberUsed = null, updateLedgerNumber = false) => {
    if (!checkPermission()) return; // Block if expired

    if (updateLedgerNumber && contact && waNumberUsed) {
      setContactsList(prev => prev.map(c => c.id === contact.id ? {
        ...c,
        phone: waNumberUsed
      } : c));
    }
    if (editingTxId) reverseTransaction(editingTxId);

    // 1. Revert Logic (Calculate the "Pre-Transaction" State)
    let currentProductsList = productsList;
    if (editingTxId) {
      // Manually calculate what the products list WOULD look like after revert
      const originalTx = transactionsList.find(t => t.id === editingTxId);
      if (originalTx && originalTx.items) {
        currentProductsList = productsList.map(p => {
          const itemInTx = originalTx.items.find(i => i.id === p.id);
          if (itemInTx) {
            const qty = parseFloat(itemInTx.quantity) || 0;
            let reversalAmount = 0;
            if (originalTx.type === 'sale') reversalAmount = qty;else if (originalTx.type === 'purchase') reversalAmount = -qty;else if (originalTx.type === 'sale_return') reversalAmount = -qty;else if (originalTx.type === 'purchase_return') reversalAmount = qty;
            return {
              ...p,
              openingStock: parseFloat(p.openingStock) + reversalAmount
            };
          }
          return p;
        });
      }
    }
    const subtotal = cartTotal;
    const finalNetTotal = Math.max(0, subtotal - discountAmountCalculated);

    // Determine the raw amount paid by the user
    let rawPaidAmount = paymentType === 'Cash' ? finalNetTotal : parseFloat(partialPaidAmount) || 0;
    let recordedPaidAmount = rawPaidAmount;
    let extraRecoveryAmount = 0; // For Sales (Wasooli)
    let extraPaymentAmount = 0; // For Purchases (Payment)

    // Logic to handle overpayment
    if (contact && rawPaidAmount > finalNetTotal) {
      if (posMode === 'sale' || posMode === 'purchase_return') {
        extraRecoveryAmount = rawPaidAmount - finalNetTotal;
      } else if (posMode === 'purchase' || posMode === 'sale_return') {
        extraPaymentAmount = rawPaidAmount - finalNetTotal;
      }
      recordedPaidAmount = finalNetTotal;
    }
    const dueAmount = finalNetTotal - recordedPaidAmount;
    const updatedProducts = currentProductsList.map(p => {
      const cartItem = cart.find(item => p.id === item.id);
      if (cartItem) {
        const currentStock = parseFloat(p.openingStock) || 0;
        const addedStock = parseFloat(cartItem.quantity) || 0;
        let stockDelta = 0;
        if (posMode === 'sale') stockDelta = -addedStock;else if (posMode === 'purchase') stockDelta = addedStock;else if (posMode === 'sale_return') stockDelta = addedStock;else if (posMode === 'purchase_return') stockDelta = -addedStock;
        const newStock = currentStock + stockDelta;
        let calculatedAvgCost = parseFloat(p.avgCost) || parseFloat(p.purchasePrice) || 0;
        if (posMode === 'purchase') {
          const oldVal = currentStock * calculatedAvgCost;
          const newVal = addedStock * (parseFloat(cartItem.purchasePrice) || 0);
          calculatedAvgCost = currentStock + addedStock > 0 ? (oldVal + newVal) / (currentStock + addedStock) : parseFloat(cartItem.purchasePrice) || 0;
        }
        return {
          ...p,
          openingStock: newStock,
          purchasePrice: posMode === 'purchase' || posMode === 'purchase_return' ? parseFloat(cartItem.purchasePrice) || 0 : p.purchasePrice,
          avgCost: calculatedAvgCost,
          salePrice: posMode === 'purchase' || posMode === 'purchase_return' ? parseFloat(cartItem.salePrice) || p.salePrice : p.salePrice,
          wholesalePrice: posMode === 'purchase' || posMode === 'purchase_return' ? parseFloat(cartItem.wholesalePrice) || p.wholesalePrice : p.wholesalePrice
        };
      }
      return p;
    });
    setProductsList(updatedProducts);
    const processedCart = cart.map(item => {
      const prod = updatedProducts.find(p => p.id === item.id);
      return {
        ...item,
        costUsedForProfit: prod ? prod.avgCost || prod.purchasePrice : item.purchasePrice
      };
    });
    const invoiceId = editingTxId || invCounter;
    if (!editingTxId) setInvCounter(prev => prev + 1);
    let originalDate = getIsoDate();
    let originalTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    if (editingTxId) {
      const originalTx = transactionsList.find(t => t.id === editingTxId);
      if (originalTx) {
        originalDate = originalTx.date || originalDate;
        originalTime = originalTx.time || originalTime;
      }
    }
    const newTx = {
      id: invoiceId,
      type: posMode,
      paymentType,
      contactId: contact ? contact.id : null,
      contactName: contact ? contact.name : waNumberUsed ? `Walk-in (${waNumberUsed})` : 'Walk-in Cash',
      subtotal: subtotal,
      discountValue: discountValue,
      discountType: discountType,
      discountAmount: discountAmountCalculated,
      amount: finalNetTotal,
      paidAmount: recordedPaidAmount,
      items: processedCart,
      time: originalTime,
      date: originalDate
    };
    if (contact) {
      setContactsList(prev => prev.map(c => {
        if (c.id === contact.id) {
          // Calculate effective change based on REAL cash given (rawPaidAmount)
          const effectiveDue = finalNetTotal - rawPaidAmount;
          let balanceChange = 0;
          if (posMode === 'sale') balanceChange = -effectiveDue;else if (posMode === 'purchase') balanceChange = effectiveDue;else if (posMode === 'sale_return') balanceChange = effectiveDue;else if (posMode === 'purchase_return') balanceChange = -effectiveDue;
          return {
            ...c,
            balance: c.balance + balanceChange
          };
        }
        return c;
      }));
    }
    const txsToAdd = [newTx];

    // Create a separate Receipt transaction for extra Sale payment
    if (extraRecoveryAmount > 0) {
      const recoveryTx = {
        id: `REC-${invoiceId}`,
        type: 'receipt',
        // Wasooli
        contactId: contact.id,
        contactName: contact.name,
        amount: extraRecoveryAmount,
        paidAmount: extraRecoveryAmount,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        date: getIsoDate(),
        description: `Extra payment (Change) from Sale Bill #${invoiceId}`,
        paymentType: 'Cash'
      };
      txsToAdd.unshift(recoveryTx);
    }

    // Create a separate Payment transaction for extra Purchase payment
    if (extraPaymentAmount > 0) {
      const paymentTx = {
        id: `PAY-${invoiceId}`,
        type: 'payment',
        // Payment
        contactId: contact.id,
        contactName: contact.name,
        amount: extraPaymentAmount,
        paidAmount: extraPaymentAmount,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        date: getIsoDate(),
        description: `Extra payment for Purchase Bill #${invoiceId}`,
        paymentType: 'Cash'
      };
      txsToAdd.unshift(paymentTx);
    }
    if (editingTxId) {
      setTransactionsList(prev => prev.map(t => t.id === editingTxId ? newTx : t));
    } else {
      setTransactionsList(prev => [...txsToAdd, ...prev]);
    }
    if (requestWA) sendWAInvoice(newTx, shopName, shopPhone, shopAddress, waNumberUsed || contact.phone);
    if (isInvoicePreviewEnabled) setSelectedViewTx(newTx);
    setCart([]);
    setEditingTxId(null);
    setIsCheckoutModalOpen(false);
    triggerSuccess();
  };
  const handleLedgerAction = () => {
    if (!checkPermission()) return; // Block if expired
    if (!ledgerAmount || !activeContact) return;
    if (editingTxId) reverseTransaction(editingTxId);
    const amount = parseFloat(ledgerAmount);
    const actionId = editingTxId || invCounter;
    if (!editingTxId) setInvCounter(prev => prev + 1);
    let originalDate = getIsoDate();
    let originalTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    if (editingTxId) {
      const originalTx = transactionsList.find(t => t.id === editingTxId);
      if (originalTx) {
        originalDate = originalTx.date || originalDate;
        originalTime = originalTx.time || originalTime;
      }
    }
    const newTx = {
      id: actionId,
      type: ledgerActionType,
      contactId: activeContact.id,
      contactName: activeContact.name,
      amount,
      paidAmount: amount,
      time: originalTime,
      date: originalDate,
      description: ledgerDesc.trim(),
      paymentType: 'Credit'
    };
    let balAdj = 0;
    if (ledgerActionType === 'receipt') balAdj = amount;else if (ledgerActionType === 'payment') balAdj = -amount;else if (ledgerActionType === 'Opening Balance') {
      const isLenaHai = ledgerDesc && ledgerDesc.includes('Lena hai');
      balAdj = isLenaHai ? -amount : amount;
    } else {
      balAdj = -amount;
    }
    setContactsList(prev => prev.map(c => c.id === activeContact.id ? {
      ...c,
      balance: c.balance + balAdj
    } : c));
    if (editingTxId) setTransactionsList(prev => prev.map(t => t.id === editingTxId ? newTx : t));else setTransactionsList(prev => [newTx, ...prev]);
    setLedgerAmount("");
    setLedgerDesc("");
    setEditingTxId(null);
    setIsLedgerActionModalOpen(false);
    triggerSuccess();
  };
  const handleAddExpenseAction = () => {
    if (!checkPermission()) return; // Block if expired
    if (!expenseAmount || !expenseDesc) return;
    let originalTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    if (editingTxId) {
      const originalTx = transactionsList.find(t => t.id === editingTxId);
      if (originalTx) {
        originalTime = originalTx.time || originalTime;
      }
      setTransactionsList(prev => prev.filter(t => t.id !== editingTxId));
    }
    const amount = parseFloat(expenseAmount);
    const actionId = editingTxId || invCounter;
    if (!editingTxId) setInvCounter(prev => prev + 1);
    const newTx = {
      id: actionId,
      type: 'expense',
      description: expenseDesc.trim(),
      amount,
      paidAmount: amount,
      time: originalTime,
      date: expenseDate
    };
    setTransactionsList(prev => [newTx, ...prev]);
    setExpenseAmount("");
    setExpenseDesc("");
    setExpenseDate(getIsoDate());
    setEditingTxId(null);
    setIsExpenseModalOpen(false);
    triggerSuccess();
  };
  const handleDeleteTransaction = (tx = null) => {
    const target = tx || txToDelete;
    if (!target) return;
    if (target.type !== 'expense') reverseTransaction(target.id);
    setTransactionsList(prev => prev.filter(t => t.id !== target.id));
    setIsDeleteTxModalOpen(false);
    setTxToDelete(null);
  };
  const handleToggleInactive = id => {
    setContactsList(prev => prev.map(c => c.id === id ? {
      ...c,
      isInactive: !c.isInactive
    } : c));
  };
  const handleEditTx = tx => {
    if (tx.type === 'sale' || tx.type === 'purchase' || tx.type === 'sale_return' || tx.type === 'purchase_return') {
      setPosMode(tx.type);
      setCart(tx.items || []);
      setEditingTxId(tx.id);
      setActiveTab('pos');
    } else if (tx.type === 'expense') {
      setExpenseDesc(tx.description || "");
      setExpenseAmount(tx.amount.toString());
      setExpenseDate(tx.date || getIsoDate());
      setEditingTxId(tx.id);
      setIsExpenseModalOpen(true);
    } else {
      const contact = contactsList.find(c => c.id === tx.contactId);
      if (contact) {
        setLedgerActionType(tx.type);
        setLedgerAmount(tx.amount.toString());
        setLedgerDesc(tx.description || "");
        setEditingTxId(tx.id);
        setSelectedLedger(contact);
        setIsLedgerActionModalOpen(true);
        setActiveTab('ledgers');
      }
    }
  };
  const handleCancelEdit = () => {
    setEditingTxId(null);
    setCart([]);
    setLedgerAmount("");
    setLedgerDesc("");
    setExpenseAmount("");
    setExpenseDesc("");
  };
  const handleProductImageChange = e => {
    const f = e.target.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = ev => compressImage(ev.target.result, 400).then(res => setProductImage(res));
      r.readAsDataURL(f);
    }
    e.target.value = "";
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "max-w-md mx-auto bg-slate-50 h-[100dvh] w-full relative shadow-2xl overflow-hidden flex flex-col border-x no-scrollbar text-left",
    onScrollCapture: handleGlobalScroll
  }, isOffline && /*#__PURE__*/React.createElement("div", {
    className: "bg-orange-500 text-white text-[10px] font-bold text-center py-1 uppercase tracking-widest flex items-center justify-center gap-2 z-[100] relative shrink-0"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "WifiOff",
    size: 12
  }), "Aap Offline Hain - App Chal Rahi Hai"), activeTab !== 'performance' && /*#__PURE__*/React.createElement("div", {
    className: `bg-blue-600 text-white shadow-lg z-[60] flex items-center justify-between rounded-b-3xl shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${showHeader ? 'max-h-24 p-4 opacity-100' : 'max-h-0 py-0 px-4 opacity-0 border-none'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, shopLogo ? /*#__PURE__*/React.createElement("img", {
    src: shopLogo,
    className: "w-9 h-9 rounded-full object-cover border-2 border-white/50"
  }) : /*#__PURE__*/React.createElement("div", {
    className: "w-9 h-9 rounded-full bg-white/20 flex items-center justify-center border border-white/30"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Store",
    size: 20
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-black uppercase truncate tracking-tight"
  }, shopName || "Store"))), /*#__PURE__*/React.createElement("div", {
    ref: mainScrollRef,
    className: "flex-1 overflow-y-auto pb-28 no-scrollbar"
  }, activeTab === 'dashboard' && /*#__PURE__*/React.createElement(Dashboard, {
    statsGroups: dashboardStats,
    ownerName: ownerName,
    currentFilter: dashFilter,
    setFilter: setDashFilter,
    customStart: dashCustomStart,
    setCustomStart: setDashCustomStart,
    customEnd: dashCustomEnd,
    setCustomEnd: setDashCustomEnd,
    transactions: transactionsList,
    onEdit: handleEditTx,
    onDelete: t => {
      setTxToDelete(t);
      setIsDeleteTxModalOpen(true);
    },
    onViewBill: setSelectedViewTx,
    onStatClick: (t, f) => {
      if (t === 'products') {
        navigateToTab('products', f);
      } else {
        navigateToTab('ledgers', t === 'viewSuppliers' ? 'supplier' : 'customer');
      }
    },
    isRomanUrduEnabled: isRomanUrduEnabled,
    onAddExpense: () => setIsExpenseModalOpen(true),
    subscription: subscription,
    isSubscriptionActive: isSubscriptionActive,
    daysLeft: daysLeft,
    isPrinterConnected: isPrinterConnected,
    isInvoicePreviewEnabled: isInvoicePreviewEnabled,
    productsList: productsList
  }), activeTab === 'pos' && /*#__PURE__*/React.createElement(POS, {
    productsList: productsList,
    addToCart: addToCart,
    cart: cart,
    cartTotal: cartTotal,
    setIsCheckoutModalOpen: setIsCheckoutModalOpen,
    posMode: posMode,
    setPosMode: setPosMode,
    isWholesaleEnabled: isWholesaleEnabled,
    isWholesaleMode: isWholesaleMode,
    setIsWholesaleMode: setIsWholesaleMode,
    isEditing: !!editingTxId,
    onCancelEdit: handleCancelEdit,
    setActiveTab: setActiveTab,
    categories: categories,
    query: posQuery,
    setQuery: setPosQuery,
    activeCategory: posActiveCategory,
    setActiveCategory: setPosActiveCategory,
    setStockError: setStockError,
    showHeader: showHeader
  }), activeTab === 'ledgers' && (activeContact ? /*#__PURE__*/React.createElement(LedgerView, {
    contact: activeContact,
    transactions: transactionsList,
    shopName: shopName,
    shopPhone: shopPhone,
    onBack: () => {
      setSelectedLedger(null);
      handleCancelEdit();
    },
    onDeleteTransaction: t => {
      setTxToDelete(t);
      setIsDeleteTxModalOpen(true);
    },
    onPaymentAction: (type, editTx) => {
      if (editTx) handleEditTx(editTx);else {
        setLedgerActionType(type);
        setIsLedgerActionModalOpen(true);
      }
    },
    onViewBill: setSelectedViewTx,
    onDeleteAccount: id => {
      if (transactionsList.some(t => t.contactId === id)) setStockError("Is account ko delete nahi kiya ja sakta, deactivate karein.");else {
        setAccountToDeleteId(id);
        setIsDeleteAccountModalOpen(true);
      }
    },
    onEditAccount: c => {
      setContactToEdit(c);
      setIsEditContactModalOpen(true);
    },
    onToggleInactive: handleToggleInactive
  }) : /*#__PURE__*/React.createElement(LedgersSection, {
    contactsList: contactsList,
    setIsAddContactModalOpen: setIsAddContactModalOpen,
    setSelectedLedger: setSelectedLedger,
    contactListTab: contactListTab,
    setContactListTab: setContactListTab,
    onToggleInactive: handleToggleInactive
  })), activeTab === 'products' && /*#__PURE__*/React.createElement(ProductSection, {
    productsList: productsList,
    setProductsList: setProductsList,
    stockFilter: stockFilter,
    setStockFilter: setStockFilter,
    setIsAddModalOpen: setIsAddModalOpen,
    resetProductForm: resetProductForm,
    handleEditProduct: p => {
      setEditingProduct(p);
      setItemName(p.name || "");
      setBarcode(p.barcode || "");
      setPurchasePrice(p.purchasePrice || "");
      setSalePrice(p.salePrice || "");
      setWholesalePrice(p.wholesalePrice || "");
      setOpeningStock(p.openingStock || "");
      setMinStock(p.minStock || "");
      setExpiryDate(p.expiryDate || "");
      setProductImage(p.image || null);
      setProductCategoryId(String(p.categoryId || "all"));
      setIsAddModalOpen(true);
    },
    categories: categories,
    setCategories: setCategories,
    pQuery: prodQuery,
    setPQuery: setProdQuery,
    activeCategory: prodActiveCategory,
    setActiveCategory: setProdActiveCategory,
    onPerformanceOpen: () => setActiveTab('performance'),
    showHeader: showHeader
  }), activeTab === 'performance' && /*#__PURE__*/React.createElement(PerformanceSection, {
    transactions: transactionsList,
    products: productsList,
    categories: categories,
    isRomanUrdu: isRomanUrduEnabled,
    onBack: () => setActiveTab('products')
  }), activeTab === 'settings' && /*#__PURE__*/React.createElement("div", {
    className: "p-4 space-y-4 text-left"
  }, settingsView === 'main' ? /*#__PURE__*/React.createElement(React.Fragment, null, (!isSubscriptionActive || subscription && subscription.status === 'trial') && /*#__PURE__*/React.createElement("div", {
    className: `p-4 rounded-2xl border shadow-sm flex items-center justify-between ${!isSubscriptionActive ? 'bg-red-50 border-red-100' : 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-100'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: `w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!isSubscriptionActive ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: !isSubscriptionActive ? "AlertCircle" : "Clock",
    size: 20
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: `font-bold text-sm ${!isSubscriptionActive ? 'text-red-700' : 'text-orange-800'}`
  }, !isSubscriptionActive ? 'Plan Khatam' : '7 Din ka Trial'), /*#__PURE__*/React.createElement("p", {
    className: `text-[10px] font-medium ${!isSubscriptionActive ? 'text-red-500' : 'text-orange-600'}`
  }, !isSubscriptionActive ? 'Kholne ke liye renew karein' : `${daysLeft} Din Baqi`))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSettingsView('premium'),
    className: `px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-md active:scale-95 transition-all ${!isSubscriptionActive ? 'bg-red-600' : 'bg-orange-500'}`
  }, !isSubscriptionActive ? 'Renew' : 'Dekhein')), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-4 rounded-3xl border shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-4 px-1 flex justify-between items-end"
  }, /*#__PURE__*/React.createElement("div", {
    onClick: handleSecretClick,
    className: "cursor-pointer select-none"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-blue-600 tracking-[0.2em]"
  }, "Your Business Card"), /*#__PURE__*/React.createElement("p", {
    className: "text-[9px] text-slate-400 font-bold uppercase tracking-tighter"
  }, "Automatic Visiting Card")), /*#__PURE__*/React.createElement(Icon, {
    name: "IdCard",
    className: "text-slate-200",
    size: 24
  })), /*#__PURE__*/React.createElement(BusinessCardCarousel, {
    shopName: shopName,
    ownerName: ownerName,
    shopPhone: shopPhone,
    shopAddress: shopAddress,
    shopLogo: shopLogo,
    currentIndex: cardTemplateIndex,
    setCurrentIndex: setCardTemplateIndex
  })), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border overflow-hidden shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setSettingsView('premium'),
    className: "flex items-center gap-4 p-4 border-b font-bold text-sm active:bg-slate-50 cursor-pointer bg-gradient-to-r from-amber-50 to-white"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Crown",
    className: "text-amber-500"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-amber-900"
  }, "Premium Subscription"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-amber-600/70 font-medium"
  }, isSubscriptionActive ? `Khatam hoga: ${subscription.expiryDate}` : 'Plan Khatam - Abhi Renew Karein')), /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-100 text-amber-600 p-1 rounded-full"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronRight",
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      setTempShopName(shopName || "");
      setTempOwnerName(ownerName || "");
      setTempShopPhone(shopPhone || "");
      setTempShopAddress(shopAddress || "");
      setTempShopLogo(shopLogo);
      setTempPaymentDetails(paymentDetails || "");
      setTempPaymentQR(paymentQR);
      setSettingsView('profile');
    },
    className: "flex items-center gap-4 p-4 border-b font-bold text-sm active:bg-slate-50 cursor-pointer"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "UserCircle",
    className: "text-blue-500"
  }), /*#__PURE__*/React.createElement("span", {
    className: "flex-1"
  }, "Store & Profile Settings"), /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronRight",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    onClick: () => setIsRomanUrduEnabled(!isRomanUrduEnabled),
    className: "flex items-center gap-4 p-4 border-b font-bold text-sm active:bg-slate-50 cursor-pointer"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Languages",
    className: "text-purple-500"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("p", null, "Home Screen Roman Urdu"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-slate-400 font-medium"
  }, "Show Urdu labels on cards")), /*#__PURE__*/React.createElement("div", {
    className: `w-10 h-5 rounded-full relative transition-colors ${isRomanUrduEnabled ? 'bg-purple-500' : 'bg-slate-300'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isRomanUrduEnabled ? 'right-0.5' : 'left-0.5'}`
  }))), /*#__PURE__*/React.createElement("div", {
    onClick: () => setIsWholesaleEnabled(!isWholesaleEnabled),
    className: "flex items-center gap-4 p-4 border-b font-bold text-sm active:bg-slate-50 cursor-pointer"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ShoppingBag",
    className: "text-orange-500"
  }), /*#__PURE__*/React.createElement("span", {
    className: "flex-1"
  }, "Wholesale Mode"), /*#__PURE__*/React.createElement("div", {
    className: `w-10 h-5 rounded-full relative ${isWholesaleEnabled ? 'bg-orange-500' : 'bg-slate-300'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: `absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isWholesaleEnabled ? 'right-0.5' : 'left-0.5'}`
  }))), /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      const newVal = !isWhatsappEnabled;
      setIsWhatsappEnabled(newVal);
      if (newVal) {
        setIsInvoicePreviewEnabled(false);
        localStorage.setItem('gs_v4_wa_toggle_pref', JSON.stringify(true));
      }
    },
    className: "flex items-center gap-4 p-4 border-b font-bold text-sm active:bg-slate-50 cursor-pointer"
  }, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "MessageCircle",
    className: "text-green-500"
  }), " ", /*#__PURE__*/React.createElement("span", {
    className: "flex-1"
  }, "WhatsApp Billing"), " ", /*#__PURE__*/React.createElement("div", {
    className: `w-10 h-5 rounded-full relative transition-colors ${isWhatsappEnabled ? 'bg-green-500' : 'bg-slate-300'}`
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: `absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isWhatsappEnabled ? 'right-0.5' : 'left-0.5'}`
  }), " "), " "), /*#__PURE__*/React.createElement("div", {
    className: "border-b"
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => {
      const newVal = !isInvoicePreviewEnabled;
      setIsInvoicePreviewEnabled(newVal);
      if (newVal) setIsWhatsappEnabled(false);
    },
    className: "flex items-center gap-4 p-4 font-bold text-sm active:bg-slate-50 cursor-pointer"
  }, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "Printer",
    className: "text-blue-600"
  }), " ", /*#__PURE__*/React.createElement("span", {
    className: "flex-1"
  }, "Print Preview"), " ", /*#__PURE__*/React.createElement("div", {
    className: `w-10 h-5 rounded-full relative transition-colors ${isInvoicePreviewEnabled ? 'bg-blue-600' : 'bg-slate-300'}`
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: `absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isInvoicePreviewEnabled ? 'right-0.5' : 'left-0.5'}`
  }), " "), " "), isInvoicePreviewEnabled && /*#__PURE__*/React.createElement("div", {
    className: "px-4 pb-4 animate-in slide-in-from-top duration-300 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-100 p-2 rounded-xl flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-500 uppercase ml-1"
  }, "Paper Size"), /*#__PURE__*/React.createElement("div", {
    className: "flex bg-white rounded-lg p-1 border shadow-sm"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setBillWidth('58mm'),
    className: `px-3 py-1 text-[10px] font-bold rounded transition-all ${billWidth === '58mm' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`
  }, "58mm"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setBillWidth('80mm'),
    className: `px-3 py-1 text-[10px] font-bold rounded transition-all ${billWidth === '80mm' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`
  }, "80mm"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 rounded-2xl p-4 border border-dashed border-slate-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center mb-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest"
  }, "Printer Status"), /*#__PURE__*/React.createElement("p", {
    className: `text-xs font-bold ${isPrinterConnected ? 'text-green-600' : 'text-slate-500'}`
  }, isPrinterConnecting ? 'Connecting...' : isPrinterConnected ? `Connected: ${connectedPrinterName}` : 'Disconnected')), /*#__PURE__*/React.createElement("div", {
    className: `w-2.5 h-2.5 rounded-full ${isPrinterConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-300'}`
  })), /*#__PURE__*/React.createElement("button", {
    onClick: handleConnectPrinter,
    disabled: isPrinterConnecting,
    className: `w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${isPrinterConnected ? 'bg-white text-blue-600 border border-blue-200' : 'bg-blue-600 text-white'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Bluetooth",
    size: 14,
    className: isPrinterConnecting ? 'animate-spin' : ''
  }), isPrinterConnected ? 'Change Printer' : 'Connect Bluetooth Printer')))), /*#__PURE__*/React.createElement("div", {
    onClick: () => setIsLogoutModalOpen(true),
    className: "flex items-center gap-4 p-4 font-bold text-sm text-red-500 active:bg-slate-50 cursor-pointer border-t"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "LogOut",
    className: "text-red-500 shrink-0"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("p", null, "Log Out"), currentUserEmail && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-medium text-slate-400 truncate mt-0.5 tracking-tight"
  }, currentUserEmail))))) : settingsView === 'premium' ? /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 animate-in slide-in-from-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4 mb-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSettingsView('main'),
    className: "p-2 bg-white rounded-full shadow text-slate-600"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ArrowLeft",
    size: 20
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-bold"
  }, "Premium Plans")), /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase tracking-[0.3em] text-amber-400 mb-1"
  }, "Current Status"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold mb-2"
  }, isSubscriptionActive ? subscription.status === 'trial' ? 'Free Trial Chal Raha Hai' : 'Premium Member' : 'Plan Khatam Ho Gaya'), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-xs font-medium opacity-80"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Calendar",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Kab tak chalega: ", subscription.expiryDate)), !isSubscriptionActive && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 bg-red-500/20 border border-red-500/50 p-2 rounded-lg text-center text-xs font-bold text-red-200"
  }, "App ka istemaal filhal band hai")), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm space-y-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-bold text-slate-800 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Key",
    size: 18,
    className: "text-amber-500"
  }), " Activate License"), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-slate-500"
  }, "Send your Device ID to admin (0319-7090233) to get a License Key."), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-100 p-3 rounded-xl flex justify-between items-center border border-slate-200"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-[8px] font-black uppercase text-slate-400"
  }, "Your Device ID"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-mono font-bold text-slate-700"
  }, deviceId)), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigator.clipboard.writeText(deviceId);
      alert("Device ID Copied!");
    },
    className: "text-blue-600 bg-blue-100 p-2 rounded-lg active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Copy",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: licenseKeyInput,
    onChange: e => setLicenseKeyInput(e.target.value),
    placeholder: "Enter License Key...",
    className: "flex-1 bg-slate-50 border p-3 rounded-xl outline-none font-bold text-xs"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: handleLicenseActivation,
    className: "bg-slate-900 text-white px-4 rounded-xl font-bold text-xs shadow-lg active:scale-95"
  }, "Activate"))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 gap-3"
  }, [{
    title: 'Monthly Starter',
    price: '299',
    duration: '1 Month',
    color: 'border-blue-200 bg-blue-50'
  }, {
    title: 'Quarterly Saver',
    price: '799',
    duration: '3 Months',
    color: 'border-purple-200 bg-purple-50',
    popular: true
  }, {
    title: 'Annual Pro',
    price: '2999',
    duration: '1 Year',
    color: 'border-amber-200 bg-amber-50'
  }].map((plan, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: `https://wa.me/923197090233?text=My Device ID is ${deviceId}. I want to subscribe to the ${plan.duration} plan for Rs.${plan.price}`,
    target: "_blank",
    className: `p-4 rounded-2xl border-2 flex justify-between items-center relative active:scale-95 transition-all cursor-pointer ${plan.color}`
  }, plan.popular && /*#__PURE__*/React.createElement("span", {
    className: "absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] font-black px-3 py-0.5 rounded-full uppercase tracking-widest shadow-sm"
  }, "Most Popular"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
    className: "font-bold text-slate-800 text-sm"
  }, plan.title), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-slate-500 uppercase tracking-wide"
  }, plan.duration)), /*#__PURE__*/React.createElement("div", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-black text-slate-900"
  }, "Rs.", formatAmount(plan.price)), /*#__PURE__*/React.createElement("span", {
    className: "inline-block mt-1 bg-slate-900 text-white text-[9px] font-bold px-3 py-1.5 rounded-lg shadow-sm"
  }, "Buy Now"))))), /*#__PURE__*/React.createElement("div", {
    className: "text-center p-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2"
  }, "Need Help?"), /*#__PURE__*/React.createElement("a", {
    href: "https://wa.me/923197090233",
    className: "flex items-center justify-center gap-2 text-green-600 font-bold text-sm bg-green-50 p-3 rounded-xl border border-green-100"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "MessageCircle",
    size: 18
  }), " Contact Support: 0319-7090233"))) : /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4 mb-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSettingsView('main'),
    className: "p-2 bg-white rounded-full shadow text-slate-600"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ArrowLeft",
    size: 20
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-bold"
  }, "Profile & Payment")), " ", /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-6 rounded-3xl border shadow-sm space-y-6"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, " ", /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-blue-600 tracking-[0.2em] border-b pb-2"
  }, "Store Profile"), " ", /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest"
  }, "Store Logo"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-full bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-inner"
  }, tempShopLogo ? /*#__PURE__*/React.createElement("img", {
    src: tempShopLogo,
    className: "w-full h-full object-cover"
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "Image",
    className: "text-slate-300",
    size: 20
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => document.getElementById('logo_in').click(),
    className: "bg-slate-800 text-white text-[10px] font-bold py-2 px-4 rounded-xl active:scale-95"
  }, "Upload New")), /*#__PURE__*/React.createElement("input", {
    type: "file",
    id: "logo_in",
    className: "hidden",
    accept: "image/*",
    onChange: e => {
      const f = e.target.files[0];
      if (f) {
        const r = new FileReader();
        r.onload = ev => compressImage(ev.target.result, 300).then(res => setTempShopLogo(res));
        r.readAsDataURL(f);
      }
    }
  })), " ", /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase"
  }, "Shop Name"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: tempShopName,
    onChange: e => setTempShopName(e.target.value),
    className: "w-full bg-slate-50 border p-3 rounded-xl outline-none font-bold text-sm"
  })), " ", /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase"
  }, "Owner Name"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: tempOwnerName,
    onChange: e => setTempOwnerName(e.target.value),
    className: "w-full bg-slate-50 border p-3 rounded-xl outline-none font-bold text-sm"
  })), " ", /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase"
  }, "Shop Phone"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: tempShopPhone,
    onChange: e => setTempShopPhone(e.target.value),
    placeholder: "0300 1234567",
    className: "w-full bg-slate-50 border p-3 rounded-xl outline-none font-bold text-sm"
  })), " ", /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase"
  }, "Shop Address"), /*#__PURE__*/React.createElement("textarea", {
    value: tempShopAddress,
    onChange: e => setTempShopAddress(e.target.value),
    rows: "2",
    className: "w-full bg-slate-50 border p-3 rounded-xl outline-none font-bold resize-none text-sm"
  })), " "), " ", /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 pt-4 border-t border-slate-100"
  }, " ", /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-black uppercase text-green-600 tracking-[0.2em] border-b pb-2"
  }, "Payment Details (On Bill)"), " ", /*#__PURE__*/React.createElement("div", null, " ", /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase"
  }, "Payment Info (Text)"), " ", /*#__PURE__*/React.createElement("textarea", {
    value: tempPaymentDetails,
    onChange: e => setTempPaymentDetails(e.target.value),
    rows: "3",
    placeholder: "Easypaisa: 0300-1234567\nBank: Meezan Bank (A/C: 1234...)",
    className: "w-full bg-slate-50 border p-3 rounded-xl outline-none font-bold resize-none text-xs leading-relaxed"
  }), " "), " ", /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, " ", /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-bold text-slate-400 uppercase tracking-widest"
  }, "Payment QR Code"), " ", /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shrink-0"
  }, " ", tempPaymentQR ? /*#__PURE__*/React.createElement("img", {
    src: tempPaymentQR,
    className: "w-full h-full object-cover"
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "QrCode",
    className: "text-slate-300",
    size: 24
  }), " "), " ", /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2"
  }, " ", /*#__PURE__*/React.createElement("button", {
    onClick: () => document.getElementById('qr_in').click(),
    className: "bg-green-600 text-white text-[10px] font-bold py-2 px-4 rounded-xl active:scale-95"
  }, "Upload QR"), " ", tempPaymentQR && /*#__PURE__*/React.createElement("button", {
    onClick: () => setTempPaymentQR(null),
    className: "text-red-500 text-[9px] font-bold"
  }, "Remove"), " "), " "), " ", /*#__PURE__*/React.createElement("input", {
    type: "file",
    id: "qr_in",
    className: "hidden",
    accept: "image/*",
    onChange: e => {
      const f = e.target.files[0];
      if (f) {
        const r = new FileReader();
        r.onload = ev => compressImage(ev.target.result, 300).then(res => setTempPaymentQR(res));
        r.readAsDataURL(f);
      }
    }
  }), " "), " "), " ", /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShopName((tempShopName || "").trim());
      setOwnerName((tempOwnerName || "").trim());
      setShopPhone((tempShopPhone || "").trim());
      setShopAddress((tempShopAddress || "").trim());
      setShopLogo(tempShopLogo);
      setPaymentDetails((tempPaymentDetails || "").trim());
      setPaymentQR(tempPaymentQR);
      setSettingsView('main');
    },
    className: "w-full bg-blue-600 text-white py-4 rounded-2xl font-bold uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all"
  }, "Save Profile"), " "), " "))), isPremiumModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl border-4 border-red-500 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 w-full h-2 bg-red-500"
  }), /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 animate-pulse"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Lock",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-2xl font-black text-slate-800 mb-1 uppercase tracking-tight"
  }, "Plan Khatam!"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs font-bold text-slate-500 mb-6 leading-relaxed"
  }, "Aapka free trial ya plan khatam ho gaya hai. Apna hisaab kitab jari rakhne ke liye renew karein."), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("a", {
    href: "https://wa.me/923197090233?text=My subscription expired. I want to renew.",
    target: "_blank",
    className: "w-full py-4 bg-green-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "MessageCircle",
    size: 18
  }), " WhatsApp Par Renew Karein"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsPremiumModalOpen(false);
      navigateToTab('settings');
      setSettingsView('premium');
    },
    className: "w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase text-[10px] tracking-widest active:scale-95"
  }, "Packages Dekhein")), /*#__PURE__*/React.createElement("p", {
    className: "mt-6 text-[9px] font-bold text-slate-400"
  }, "Support: 0319-7090233"))), stockError && /*#__PURE__*/React.createElement("div", {
    className: "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[500] w-64 bg-white p-6 rounded-3xl shadow-2xl border-2 border-red-500 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-red-600"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "AlertCircle",
    size: 28
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-bold mb-1 text-sm"
  }, "Masla!"), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-slate-500 mb-4"
  }, stockError), /*#__PURE__*/React.createElement("button", {
    onClick: () => setStockError(null),
    className: "w-full py-2 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase"
  }, "Theek Hai")), selectedViewTx && /*#__PURE__*/React.createElement(BillPreviewModal, {
    tx: selectedViewTx,
    shopName: shopName,
    shopPhone: shopPhone,
    shopAddress: shopAddress,
    shopLogo: shopLogo,
    paymentDetails: paymentDetails,
    paymentQR: paymentQR,
    billWidth: billWidth,
    onClose: () => setSelectedViewTx(null)
  }), isAddModalOpen && /*#__PURE__*/React.createElement(AddProductModal, {
    editingProduct: editingProduct,
    itemName: itemName,
    setItemName: setItemName,
    barcode: barcode,
    setBarcode: setBarcode,
    purchasePrice: purchasePrice,
    setPurchasePrice: setPurchasePrice,
    salePrice: salePrice,
    setSalePrice: setSalePrice,
    wholesalePrice: wholesalePrice,
    setWholesalePrice: setWholesalePrice,
    openingStock: openingStock,
    setOpeningStock: setOpeningStock,
    minStock: minStock,
    setMinStock: setMinStock,
    expiryDate: expiryDate,
    setExpiryDate: setExpiryDate,
    productImage: productImage,
    setProductImage: setProductImage,
    setIsAddModalOpen: setIsAddModalOpen,
    resetProductForm: resetProductForm,
    productsList: productsList,
    setProductsList: setProductsList,
    setStockError: setStockError,
    categories: categories,
    setCategories: setCategories,
    productCategoryId: productCategoryId,
    setProductCategoryId: setProductCategoryId
  }), isCheckoutModalOpen && /*#__PURE__*/React.createElement(CheckoutModal, {
    setIsCheckoutModalOpen: setIsCheckoutModalOpen,
    cart: cart,
    setCart: setCart,
    cartTotal: cartTotal,
    posMode: posMode,
    onComplete: handleCheckout,
    contactsList: contactsList,
    updateCartQty: updateCartQty,
    removeCartItem: removeCartItem,
    clearCart: clearCart,
    isWhatsappEnabled: isWhatsappEnabled,
    isEditing: !!editingTxId
  }), isLedgerActionModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 space-y-4 shadow-2xl text-left"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center border-b pb-2"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-slate-800 text-lg"
  }, editingTxId ? 'Update Entry' : ledgerActionType === 'receipt' ? 'Recovery Receipt' : 'Payment Voucher'), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsLedgerActionModalOpen(false);
      handleCancelEdit();
    },
    className: "p-2 text-slate-400"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), " ", /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, " ", /*#__PURE__*/React.createElement("input", {
    type: "number",
    step: "any",
    value: ledgerAmount || "",
    onChange: e => setLedgerAmount(e.target.value),
    className: "w-full bg-slate-50 border p-4 rounded-2xl font-bold text-lg outline-none",
    placeholder: "0.00",
    autoFocus: true
  }), " ", /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: ledgerDesc || "",
    onChange: e => setLedgerDesc(e.target.value),
    className: "w-full bg-slate-50 border p-4 rounded-2xl font-bold outline-none",
    placeholder: "Note (Optional)"
  }), " "), " ", /*#__PURE__*/React.createElement("button", {
    onClick: handleLedgerAction,
    className: `w-full py-4 rounded-2xl font-bold text-white uppercase text-xs tracking-widest ${ledgerActionType === 'receipt' ? 'bg-green-600' : 'bg-red-600'}`
  }, editingTxId ? 'Update Karein' : 'Confirm Karein'), " "), " "), isExpenseModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 space-y-4 shadow-2xl animate-in zoom-in duration-300 text-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center border-b pb-2"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-slate-800 text-lg"
  }, editingTxId ? 'Update Expense' : 'Add New Expense'), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsExpenseModalOpen(false);
      handleCancelEdit();
    },
    className: "p-2 text-slate-400"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase ml-1"
  }, "Date"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: expenseDate || "",
    onChange: e => setExpenseDate(e.target.value),
    className: "w-full bg-slate-50 border p-3 rounded-xl font-bold outline-none text-sm"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase ml-1"
  }, "Amount"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: expenseAmount || "",
    onChange: e => setExpenseAmount(e.target.value),
    className: "w-full bg-slate-50 border p-3 rounded-xl font-bold text-lg outline-none",
    placeholder: "0.00",
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase ml-1"
  }, "Description (Detail)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: expenseDesc || "",
    onChange: e => setExpenseDesc(e.target.value),
    className: "w-full bg-slate-50 border p-3 rounded-xl font-bold outline-none text-sm",
    placeholder: "e.g. Shop Rent, Bijli Bill, Chai Pani"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: handleAddExpenseAction,
    className: "w-full py-4 rounded-2xl font-bold text-white uppercase text-xs tracking-widest bg-red-600 border-b-4 border-red-800 shadow-lg active:scale-95 transition-all"
  }, editingTxId ? 'Update Expense' : 'Save Expense'))), isDeleteTxModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 text-center shadow-2xl"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "AlertTriangle",
    size: 48,
    className: "text-red-500 mb-4 mx-auto"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-bold text-slate-800 text-sm"
  }, "Delete Transaction?"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3 mt-6"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsDeleteTxModalOpen(false),
    className: "py-3 bg-slate-100 rounded-2xl font-bold text-slate-600 uppercase text-xs"
  }, "Nahi"), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleDeleteTransaction(),
    className: "py-3 bg-red-600 text-white rounded-2xl font-bold uppercase text-xs"
  }, "Haan")))), isDeleteAccountModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 text-center shadow-2xl text-left"
  }, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "AlertTriangle",
    size: 48,
    className: "text-red-500 mb-4 mx-auto"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-lg font-bold text-slate-800 text-center"
  }, "Delete Account?"), " ", /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3 mt-6"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsDeleteAccountModalOpen(false),
    className: "py-3 bg-slate-100 rounded-2xl font-bold text-slate-600 uppercase text-xs text-center"
  }, "Nahi"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setContactsList(prev => prev.filter(c => c.id !== accountToDeleteId));
      setIsDeleteAccountModalOpen(false);
      setAccountToDeleteId(null);
      setSelectedLedger(null);
      navigateToTab('ledgers');
    },
    className: "py-3 bg-red-600 text-white rounded-2xl font-bold uppercase text-xs shadow-lg text-center"
  }, "Haan, Delete Karein")), " "), " "), /*#__PURE__*/React.createElement("nav", {
    className: "fixed bottom-0 left-0 right-0 bg-white border-t px-2 py-3 shadow-lg z-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-md mx-auto flex justify-between items-center px-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigateToTab('dashboard');
      handleCancelEdit();
    },
    className: `flex flex-col items-center flex-1 ${activeTab === 'dashboard' ? 'text-blue-600 font-bold' : 'text-slate-400'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "LayoutDashboard"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] mt-1 uppercase font-bold"
  }, "Home")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigateToTab('ledgers');
      handleCancelEdit();
    },
    className: `flex flex-col items-center flex-1 ${activeTab === 'ledgers' ? 'text-blue-600 font-bold' : 'text-slate-400'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Users"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] mt-1 uppercase font-bold"
  }, "Ledgers")), /*#__PURE__*/React.createElement("button", {
    onClick: () => navigateToTab('pos'),
    className: "flex flex-col items-center flex-1 -mt-8 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: `p-4 rounded-full shadow-lg border-4 border-white flex items-center justify-center ${activeTab === 'pos' ? 'bg-green-600' : 'bg-slate-800'} text-white`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "ShoppingCart"
  })), /*#__PURE__*/React.createElement("span", {
    className: `text-[10px] mt-1 uppercase font-bold ${activeTab === 'pos' ? 'text-blue-600' : 'text-slate-400'}`
  }, "POS")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigateToTab('products');
      handleCancelEdit();
    },
    className: `flex flex-col items-center flex-1 ${activeTab === 'products' || activeTab === 'performance' ? 'text-blue-600' : 'text-slate-400'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Package"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] mt-1 uppercase font-bold"
  }, "Products")), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      navigateToTab('settings');
      handleCancelEdit();
    },
    className: `flex flex-col items-center flex-1 ${activeTab === 'settings' ? 'text-blue-600' : 'text-slate-400'}`
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Settings"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] mt-1 uppercase font-bold"
  }, "Settings")))), /*#__PURE__*/React.createElement("input", {
    type: "file",
    id: "p_img_cam",
    className: "hidden",
    accept: "image/*",
    capture: "environment",
    onChange: handleProductImageChange
  }), /*#__PURE__*/React.createElement("input", {
    type: "file",
    id: "p_img_gal",
    className: "hidden",
    accept: "image/*",
    onChange: handleProductImageChange
  }), isAddContactModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end justify-center"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-t-3xl shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom text-left"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-bold"
  }, "New Account"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsAddContactModalOpen(false);
      setContactErrors({});
    },
    className: "p-2 text-slate-400"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), " ", /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-100 p-1 rounded-xl flex items-center mb-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setContactListTab('customer'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold ${contactListTab === 'customer' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`
  }, "Customer"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setContactListTab('supplier'),
    className: `flex-1 py-2 rounded-lg text-xs font-bold ${contactListTab === 'supplier' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`
  }, "Supplier")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    id: "cn",
    type: "text",
    placeholder: "Full Name*",
    className: `w-full bg-slate-50 border ${contactErrors.name ? 'border-red-500' : 'bg-slate-50 border-slate-50'} p-4 rounded-2xl outline-none font-semibold text-sm`,
    onChange: () => setContactErrors(prev => ({
      ...prev,
      name: false
    }))
  }), contactErrors.name && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-red-500 mt-1 ml-1 animate-pulse"
  }, "Bhai, account ka naam likhna zaroori hai.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    id: "cp",
    type: "tel",
    placeholder: "WhatsApp Number (Optional)",
    maxLength: 11,
    className: `w-full bg-slate-50 border ${contactErrors.phone ? 'border-red-500' : 'bg-slate-50 border-slate-50'} p-4 rounded-2xl outline-none font-semibold text-sm`,
    onChange: e => {
      // Restrict to numbers only
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
      setContactErrors(prev => ({
        ...prev,
        phone: false
      }));
    }
  }), contactErrors.phone && /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] font-bold text-red-500 mt-1 ml-1 animate-pulse"
  }, "Number poora 11 hindson ka hona chahiye (ya khaali chor dein).")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    id: "cb",
    type: "number",
    step: "any",
    placeholder: "Sabiqa Baqaya (Opening Balance)",
    className: "w-full bg-slate-50 border p-4 rounded-2xl outline-none font-semibold text-sm"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 mt-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpeningBalType('receivable'),
    className: `flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${openingBalType === 'receivable' ? 'bg-green-100 border-green-500 text-green-700 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400'}`
  }, "Mainay Leny Hain", /*#__PURE__*/React.createElement("br", null), "(Receivable)"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpeningBalType('payable'),
    className: `flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${openingBalType === 'payable' ? 'bg-red-100 border-red-500 text-red-700 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-400'}`
  }, "Mainay Deny Hain", /*#__PURE__*/React.createElement("br", null), "(Payable)")))), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const n = document.getElementById('cn').value.trim();
      const p = document.getElementById('cp').value.trim();
      const b = document.getElementById('cb').value;
      const newErrors = {};
      if (!n) newErrors.name = true;
      if (p && p.length !== 11) {
        newErrors.phone = true;
      }
      if (Object.keys(newErrors).length > 0) {
        setContactErrors(newErrors);
        setStockError("Naam zaroori hai. Number agar likha hai to poora likhein.");
        return;
      }
      const rawBalance = parseFloat(b) || 0;
      const finalBalance = openingBalType === 'receivable' ? -Math.abs(rawBalance) : Math.abs(rawBalance);
      const newContactId = Date.now();
      const newContact = {
        id: newContactId,
        name: n,
        phone: p,
        balance: finalBalance,
        type: contactListTab,
        isInactive: false
      };
      setContactsList([...contactsList, newContact]);
      if (rawBalance > 0) {
        const openingTx = {
          id: `OP-${newContactId}`,
          type: 'Opening Balance',
          contactId: newContactId,
          contactName: n,
          amount: rawBalance,
          paidAmount: 0,
          date: getIsoDate(),
          time: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }),
          description: `Sabiqa Baqaya (${openingBalType === 'receivable' ? 'Lena hai' : 'Dena hai'})`,
          paymentType: 'Credit'
        };
        setTransactionsList(prev => [openingTx, ...prev]);
      }
      setIsAddContactModalOpen(false);
      setContactErrors({});
    },
    className: "w-full bg-green-600 text-white py-4 rounded-2xl font-bold uppercase shadow-lg text-xs tracking-widest active:scale-95 transition-all"
  }, "Save Account"), " "), " "), isEditContactModalOpen && contactToEdit && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end justify-center"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-t-3xl shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom text-left"
  }, " ", /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-bold"
  }, "Edit Account"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setIsEditContactModalOpen(false);
      setContactErrors({});
    },
    className: "p-2 text-slate-400"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X"
  }))), " ", /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, " ", /*#__PURE__*/React.createElement("div", null, " ", /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block"
  }, "Name"), " ", /*#__PURE__*/React.createElement("input", {
    id: "edit_cn",
    type: "text",
    defaultValue: contactToEdit.name || "",
    className: `w-full bg-slate-50 border ${contactErrors.name ? 'border-red-500' : 'border-slate-50'} p-4 rounded-2xl outline-none font-semibold text-sm focus:border-blue-400`,
    onChange: () => setContactErrors(prev => ({
      ...prev,
      name: false
    }))
  }), " "), " ", /*#__PURE__*/React.createElement("div", null, " ", /*#__PURE__*/React.createElement("label", {
    className: "text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block"
  }, "WhatsApp Number"), " ", /*#__PURE__*/React.createElement("input", {
    id: "edit_cp",
    type: "tel",
    defaultValue: contactToEdit.phone || "",
    maxLength: 11,
    className: `w-full bg-slate-50 border ${contactErrors.phone ? 'border-red-500' : 'border-slate-50'} p-4 rounded-2xl outline-none font-semibold text-sm focus:border-blue-400`,
    onChange: e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
      setContactErrors(prev => ({
        ...prev,
        phone: false
      }));
    }
  }), " "), " "), " ", /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const n = document.getElementById('edit_cn').value.trim();
      const p = document.getElementById('edit_cp').value.trim();
      const newErrors = {};
      if (!n) newErrors.name = true;
      if (p && p.length !== 11) {
        newErrors.phone = true;
      }
      if (Object.keys(newErrors).length > 0) {
        setContactErrors(newErrors);
        return;
      }
      setContactsList(contactsList.map(c => c.id === contactToEdit.id ? {
        ...c,
        name: n,
        phone: p
      } : c));
      setTransactionsList(prev => prev.map(t => t.contactId === contactToEdit.id ? {
        ...t,
        contactName: n
      } : t));
      setIsEditContactModalOpen(false);
      setContactErrors({});
    },
    className: "w-full bg-blue-600 text-white py-4 rounded-2xl font-bold uppercase shadow-lg text-xs tracking-widest active:scale-95 transition-all"
  }, " Update Details "), " "), " "), isBackupModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in duration-200 text-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center mb-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg text-slate-800"
  }, "Data Backup / Restore"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsBackupModalOpen(false),
    className: "p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 active:scale-90"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "X",
    size: 16
  }))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mb-6 font-medium leading-relaxed"
  }, "Apna sara hisaab download karein ya pehle se save kiya hua backup (JSON file) yahan upload kar ke restore karein."), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handleExportBackup,
    className: "w-full py-4 bg-blue-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Download",
    size: 18
  }), " Backup Download"), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".json",
    onChange: handleImportBackup,
    className: "absolute inset-0 w-full h-full opacity-0 cursor-pointer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all border-2 border-dashed border-slate-300 pointer-events-none"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "Upload",
    size: 18
  }), " Backup Restore (Upload)"))))), isLogoutModalOpen && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white w-full max-sm rounded-3xl p-6 text-center shadow-2xl animate-in zoom-in duration-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 ring-4 ring-red-50/50"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "LogOut",
    size: 32
  })), /*#__PURE__*/React.createElement("h3", {
    className: "font-bold text-lg text-slate-800 mb-1"
  }, "Log Out Karein?"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mb-6 font-medium leading-relaxed"
  }, "Kya aap waqai app se logout karna chahte hain?"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsLogoutModalOpen(false),
    className: "py-3 bg-slate-100 rounded-xl font-bold text-slate-500 text-xs uppercase tracking-widest active:scale-95"
  }, "Nahi"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      auth.signOut().then(() => {
        window.location.reload();
      });
    },
    className: "py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95"
  }, "Haan, Logout")))), showSuccessAnimation && /*#__PURE__*/React.createElement(SuccessAnimation, null));
};
const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);
  if (isAuthChecking) {
    return /*#__PURE__*/React.createElement("div", {
      className: "min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"
    }), /*#__PURE__*/React.createElement("p", {
      className: "mt-4 font-bold text-slate-500 uppercase tracking-widest text-xs"
    }, "Loading Dukan360..."));
  }
  if (!isAuthenticated) {
    return /*#__PURE__*/React.createElement(Login, {
      onLogin: () => setIsAuthenticated(true)
    });
  }
  return /*#__PURE__*/React.createElement(AppContent, null);
};
const rootInstance = ReactDOM.createRoot(document.getElementById('root'));
rootInstance.render(/*#__PURE__*/React.createElement(App, null));
