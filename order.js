const urlParams = new URLSearchParams(window.location.search);
const info = urlParams.get("id");

const orders = JSON.parse(localStorage.getItem("orders"));

const order = orders.filter((order) => order["ID PEDIDO"] === info);

const sedeParagraph = document.getElementById("sede-name");
const deliberyDateParagraph = document.getElementById("delibery-date");
const container = document.getElementById("table-body");
const commentParagraph = document.getElementById("comment");
const netCostParagraph = document.getElementById("valor-neto-amount");
const finalPriceParagraph = document.getElementById("valor-servicio-amount");
const productsCount = document.getElementById("total-amount");

sedeParagraph.textContent = order[0].SEDE;
deliberyDateParagraph.textContent = order[0]["FECHA ENTREGA"];

order[0].products.forEach(product => {
  const row = document.createElement('tr');

  const productName = document.createElement('td');
  productName.textContent = product.name;

  const productQuantity = document.createElement('td');
  productQuantity.textContent = product.quantity;

  const productTotalPrice = document.createElement('td');
  productTotalPrice.textContent = product.totalPrice;

  row.append(productName, productQuantity, productTotalPrice);

  container.append(row);
});

commentParagraph.textContent = order[0]["OBSERVACIONES"];
productsCount.textContent = order[0].products.length;

netCostParagraph.textContent = order[0].netCost;
finalPriceParagraph.textContent = order[0].costWithService;
