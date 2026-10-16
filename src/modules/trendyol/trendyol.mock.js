exports.getMockOrders = async () => {
  return [
    { id: 1001, marketplace: 'Trendyol', orderNumber: 'TR-123', product: 'Siyah T-Shirt', qty: 1, customer: 'Ahmet Y.' },
    { id: 1002, marketplace: 'Hepsiburada', orderNumber: 'HB-987', product: 'Siyah T-Shirt', qty: 2, customer: 'Ayse K.' },
  ];
}
exports.getMockProducts = async () => {
  return [{ barcode: '86800001', title: 'Siyah T-Shirt', stock: 150 }];
}