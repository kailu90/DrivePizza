import "dotenv/config";
import http from "http";
const SUPA = process.env.SUPABASE_SERVICE_KEY;
const headers = { "apikey": SUPA, "Authorization": "Bearer " + SUPA, "Content-Type": "application/json", "Prefer": "return=minimal" };

const req = (method, path, body) => new Promise((res,rej) => {
  const opts = { hostname:"localhost", port:8000, path, method, headers };
  const r = http.request(opts, resp => { let d=""; resp.on("data",c=>d+=c); resp.on("end",()=>res({status:resp.statusCode,body:d})); });
  r.on("error",rej);
  if (body) r.write(JSON.stringify(body));
  r.end();
});
const get   = (path)        => req("GET",    path      ).then(r=>JSON.parse(r.body));
const patch = (path, body)  => req("PATCH",  path, body);
const del   = (path)        => req("DELETE", path      );

const clientes    = await get("/rest/v1/clientes?select=id,telefono,nombre&limit=2000");
const lids        = clientes.filter(r => r.telefono && r.telefono.replace(/[^0-9]/g,"").length >= 13);
const identidades = await get("/rest/v1/wa_identidades?select=lid,telefono&lid=in.(" + lids.map(r=>r.telefono).join(",") + ")");
const identMap    = Object.fromEntries(identidades.map(r => [r.lid, r.telefono]));
const clientesByTel = Object.fromEntries(clientes.filter(r=>r.telefono.length===10).map(r=>[r.telefono,r]));

let migrados=0, actualTelUpdated=0, idsToDelete=[];

for (const lid_row of lids) {
  const realTel = identMap[lid_row.telefono];
  if (realTel === undefined) {
    idsToDelete.push(lid_row.id);
    console.log("HUERFANO borrar:", lid_row.telefono, "|", lid_row.nombre);
    continue;
  }
  const realRow = clientesByTel[realTel];
  if (realRow === undefined) {
    // No existe registro real — convertir el fantasma al teléfono real
    const r = await patch("/rest/v1/clientes?id=eq." + lid_row.id, { telefono: realTel });
    console.log("MIGRADO (actualiza telefono):", lid_row.telefono, "->", realTel, "|", lid_row.nombre, "| status:", r.status);
    migrados++;
  } else {
    // Existe registro real — actualizar nombre solo si el real está vacío
    const realNombre = (realRow.nombre || "").trim();
    const lidNombre  = (lid_row.nombre || "").trim();
    if (realNombre === "" || realNombre === ".") {
      const r = await patch("/rest/v1/clientes?id=eq." + realRow.id, { nombre: lidNombre });
      console.log("ACTUALIZA nombre real:", realTel, "| '' ->", lidNombre, "| status:", r.status);
      actualTelUpdated++;
    } else {
      console.log("MANTIENE nombre real:", realTel, "|", realNombre, "(LID tenia:", lidNombre + ")");
    }
    idsToDelete.push(lid_row.id);
  }
}

if (idsToDelete.length > 0) {
  const r = await del("/rest/v1/clientes?id=in.(" + idsToDelete.join(",") + ")");
  console.log("\nBorrados", idsToDelete.length, "fantasmas | status:", r.status);
}
console.log("\nResumen: migrados=" + migrados + " actualTelUpdated=" + actualTelUpdated + " borrados=" + idsToDelete.length);
