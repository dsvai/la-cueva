/* ============================================================
   LA CUEVA · Shopify con acceso completo y controlado
   - Consultas: cualquier consulta GraphQL de lectura de la Admin API.
   - Cambios: una mutación GraphQL cuyas operaciones estén en la lista permitida.
     Se proponen, el administrador las aprueba y el servidor las ejecuta una vez.
   Queda fuera todo lo que mueve dinero o toca la cuenta (reembolsos, cobros,
   cancelaciones con reembolso, suscripciones de apps, personal, pagos, webhooks).
   ============================================================ */
import { parse, Kind } from 'graphql';

/* operación → [etiqueta en español, riesgo] · riesgo: 'publica', 'borra', 'diseño', 'clientes' o '' */
export const MUTATIONS = {
  // productos y variantes
  productCreate: ['Crear producto', ''], productUpdate: ['Editar producto', ''], productSet: ['Crear o sustituir producto completo', ''],
  productDuplicate: ['Duplicar producto', ''], productDelete: ['Borrar producto', 'borra'], productChangeStatus: ['Cambiar estado de producto', 'publica'],
  productVariantsBulkCreate: ['Crear variantes', ''], productVariantsBulkUpdate: ['Editar variantes (precios, SKU…)', ''], productVariantsBulkDelete: ['Borrar variantes', 'borra'],
  productVariantsBulkReorder: ['Reordenar variantes', ''], productOptionsCreate: ['Crear opciones de producto', ''], productOptionUpdate: ['Editar opción de producto', ''], productOptionsDelete: ['Borrar opciones de producto', 'borra'],
  productCreateMedia: ['Añadir imágenes a producto', ''], productUpdateMedia: ['Editar imágenes de producto', ''], productDeleteMedia: ['Borrar imágenes de producto', 'borra'], productReorderMedia: ['Reordenar imágenes', ''],
  productVariantAppendMedia: ['Asignar imagen a variante', ''], productVariantDetachMedia: ['Quitar imagen de variante', ''],
  publishablePublish: ['Publicar en canales de venta', 'publica'], publishableUnpublish: ['Retirar de canales de venta', 'publica'],
  tagsAdd: ['Añadir etiquetas', ''], tagsRemove: ['Quitar etiquetas', ''],
  // inventario
  inventorySetQuantities: ['Fijar stock', ''], inventoryAdjustQuantities: ['Ajustar stock', ''], inventoryItemUpdate: ['Editar artículo de inventario (coste, peso…)', ''], inventoryActivate: ['Activar inventario en una ubicación', ''],
  // colecciones
  collectionCreate: ['Crear colección', ''], collectionUpdate: ['Editar colección', ''], collectionDelete: ['Borrar colección', 'borra'],
  collectionAddProducts: ['Añadir productos a colección', ''], collectionAddProductsV2: ['Añadir productos a colección', ''], collectionRemoveProducts: ['Quitar productos de colección', ''], collectionReorderProducts: ['Reordenar colección', ''],
  // contenido de la tienda online
  pageCreate: ['Crear página', ''], pageUpdate: ['Editar página', ''], pageDelete: ['Borrar página', 'borra'],
  blogCreate: ['Crear blog', ''], blogUpdate: ['Editar blog', ''], articleCreate: ['Crear artículo de blog', ''], articleUpdate: ['Editar artículo de blog', ''], articleDelete: ['Borrar artículo', 'borra'],
  menuCreate: ['Crear menú', 'diseño'], menuUpdate: ['Editar menú', 'diseño'],
  urlRedirectCreate: ['Crear redirección', ''], urlRedirectUpdate: ['Editar redirección', ''], urlRedirectDelete: ['Borrar redirección', 'borra'],
  metafieldsSet: ['Guardar campos personalizados (metafields)', ''], metafieldsDelete: ['Borrar campos personalizados', 'borra'],
  metaobjectCreate: ['Crear metaobjeto', ''], metaobjectUpdate: ['Editar metaobjeto', ''], metaobjectUpsert: ['Crear o editar metaobjeto', ''], metaobjectDelete: ['Borrar metaobjeto', 'borra'],
  translationsRegister: ['Guardar traducciones', ''], translationsRemove: ['Borrar traducciones', 'borra'],
  fileCreate: ['Subir archivos o imágenes', ''], fileUpdate: ['Editar archivos', ''], fileDelete: ['Borrar archivos', 'borra'], stagedUploadsCreate: ['Preparar subida de archivos', ''],
  shopPolicyUpdate: ['Editar políticas de la tienda', 'publica'],
  // diseño (temas)
  themeFilesUpsert: ['Editar archivos del tema', 'diseño'], themeFilesCopy: ['Copiar archivos del tema', 'diseño'], themeDuplicate: ['Duplicar tema', ''], themePublish: ['Publicar tema (cambia la web visible)', 'diseño'],
  // descuentos
  discountCodeBasicCreate: ['Crear código de descuento', 'publica'], discountCodeBasicUpdate: ['Editar código de descuento', 'publica'],
  discountCodeBxgyCreate: ['Crear descuento compra X lleva Y', 'publica'], discountCodeBxgyUpdate: ['Editar descuento compra X lleva Y', 'publica'],
  discountCodeFreeShippingCreate: ['Crear descuento de envío gratis', 'publica'], discountCodeFreeShippingUpdate: ['Editar descuento de envío gratis', 'publica'],
  discountAutomaticBasicCreate: ['Crear descuento automático', 'publica'], discountAutomaticBasicUpdate: ['Editar descuento automático', 'publica'],
  discountCodeActivate: ['Activar código de descuento', 'publica'], discountCodeDeactivate: ['Desactivar código de descuento', 'publica'],
  discountAutomaticActivate: ['Activar descuento automático', 'publica'], discountAutomaticDeactivate: ['Desactivar descuento automático', 'publica'],
  discountCodeDelete: ['Borrar código de descuento', 'borra'], discountAutomaticDelete: ['Borrar descuento automático', 'borra'],
  // pedidos y clientes (sin dinero)
  orderUpdate: ['Editar pedido (notas, etiquetas, dirección)', 'clientes'], draftOrderCreate: ['Crear pedido en borrador', ''], draftOrderUpdate: ['Editar pedido en borrador', ''],
  fulfillmentCreate: ['Marcar pedido como enviado (avisa al cliente)', 'clientes'],
  customerCreate: ['Crear cliente', 'clientes'], customerUpdate: ['Editar cliente', 'clientes']
};
export const RISK_TEXT = {
  publica: 'Cambia lo que ven los clientes en la tienda.',
  borra: 'BORRA datos de la tienda (no se puede deshacer desde La Cueva).',
  diseño: 'Cambia el diseño o la navegación de la web.',
  clientes: 'Afecta a pedidos o datos de clientes (puede enviarles un aviso).'
};

export class GqlError extends Error { constructor(message) { super(message); this.code = 'invalid'; this.expose = true; } }

/* analiza el documento: una sola operación del tipo esperado; devuelve sus campos raíz */
export function inspect(text, kind) {
  const src = String(text || '').trim();
  if (!src) throw new GqlError('Falta el texto GraphQL.');
  if (src.length > 40000) throw new GqlError('La operación es demasiado larga.');
  let doc; try { doc = parse(src); } catch (e) { throw new GqlError('GraphQL no válido: ' + String(e.message).slice(0, 200)); }
  const ops = doc.definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION);
  if (ops.length !== 1) throw new GqlError('Envía exactamente una operación.');
  const op = ops[0];
  if (op.operation !== kind) throw new GqlError(kind === 'query' ? 'Para cambiar algo usa shopify_proponer_cambio; aquí solo se consulta.' : 'Esto debe ser una mutación («mutation { … }»).');
  const roots = [];
  for (const sel of op.selectionSet.selections) {
    if (sel.kind !== Kind.FIELD) throw new GqlError('En la raíz solo se admiten campos (sin fragmentos).');
    roots.push(sel.name.value);
  }
  if (!roots.length) throw new GqlError('La operación está vacía.');
  return roots;
}
export function checkQuery(text) { return inspect(text, 'query'); }
export function checkMutation(text) {
  const roots = inspect(text, 'mutation');
  if (roots.length > 5) throw new GqlError('Máximo 5 operaciones por cambio; divídelo en varias propuestas.');
  const bad = roots.filter(r => !MUTATIONS[r]);
  if (bad.length) throw new GqlError('Operación no permitida desde La Cueva: ' + bad.join(', ') + '. Lo que mueve dinero o toca la cuenta (reembolsos, cobros, cancelaciones, apps, personal, pagos) queda fuera.');
  return roots.map(r => ({ op: r, label: MUTATIONS[r][0], risk: MUTATIONS[r][1] }));
}
/* recoge los userErrors de cualquier nivel de la respuesta */
export function userErrors(data) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'userErrors' && Array.isArray(v)) for (const e of v) out.push((e.field ? [].concat(e.field).join('.') + ': ' : '') + e.message);
      else walk(v);
    }
  })(data);
  return out;
}
