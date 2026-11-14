// ==========================================================
// admin-labels.js — Trang quản trị › "Nhãn sản phẩm".
// Admin quản lý NHÓM nhãn (tên, kiểu chọn 1 / chọn nhiều) và NHÃN trong từng nhóm (tên, màu, mô tả),
// rồi gán nhãn cho sản phẩm trong form sản phẩm (renderLabelPicker / readLabelPicker bên dưới).
// Xóa nhãn / nhóm sẽ gỡ nhãn đó khỏi mọi sản phẩm đang dùng (có hỏi xác nhận, nêu rõ số sản phẩm).
// ==========================================================
import {
  getProducts, updateProduct,
  createLabelGroup, updateLabelGroup, deleteLabelGroup,
  createLabel, updateLabel, deleteLabel,
} from "./api.js";
import { escapeHTML, showToast } from "./ui.js";
import { ensureLabels, getLabelCache, LABEL_COLORS, labelChip } from "./labels.js";

const colorOptions = (selected) => Object.entries(LABEL_COLORS)
  .map(([key, c]) => `<label class="lb-color"><input type="radio" name="color" value="${key}" ${key === selected ? "checked" : ""}><span style="--c:${c.dot}" title="${c.name}"></span><em>${c.name}</em></label>`).join("");

const nextOrder = (list) => (list.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1);

// Gỡ các nhãn (ids) khỏi mọi sản phẩm đang dùng; đồng bộ lại 2 trường cũ difficulty / petSafe.
async function detachLabels(ids, products) {
  const drop = new Set(ids.map(String));
  const { labels, groups } = getLabelCache();
  const remain = labels.filter((l) => !drop.has(String(l.id)));
  for (const p of products) {
    const cur = (p.labelIds || []).map(String);
    if (!cur.some((id) => drop.has(id))) continue;
    const labelIds = cur.filter((id) => !drop.has(id));
    await updateProduct(p.id, { labelIds, ...legacyFields(labelIds, remain, groups, p) });
  }
}

// 2 trường cũ vẫn được chatbot và bộ lọc "Gợi ý chọn cây" đọc → giữ đồng bộ theo nhãn đã gán:
//   difficulty = tên nhãn thuộc nhóm chọn-1 đầu tiên; petSafe = có nhãn được đánh dấu "an toàn với thú cưng".
export function legacyFields(labelIds, labels = getLabelCache().labels, groups = getLabelCache().groups, product = null) {
  const ids = (labelIds || []).map(String);
  const mine = labels.filter((l) => ids.includes(String(l.id)));
  const firstSingle = groups.find((g) => g.selection === "single");
  const care = firstSingle ? mine.find((l) => String(l.groupId) === String(firstSingle.id)) : null;
  const safetyGroups = new Set(labels.filter((l) => l.petSafe === true).map((l) => String(l.groupId)));
  const hasSafetyLabel = mine.some((l) => safetyGroups.has(String(l.groupId)));
  return {
    difficulty: care ? care.name : (product?.careLevel ? "" : (product?.difficulty === "Phụ kiện" ? "Phụ kiện" : "")),
    petSafe: mine.some((l) => l.petSafe === true) ? true : hasSafetyLabel ? false : null,
  };
}

// ---------- Bộ chọn nhãn trong form sản phẩm ----------
export function renderLabelPicker(product) {
  const { groups, labels } = getLabelCache();
  if (!groups.length) return `<p class="muted">Chưa có nhóm nhãn nào. Tạo ở mục <strong>Nhãn sản phẩm</strong>.</p>`;
  const picked = (product?.labelIds || []).map(String);
  return groups.map((g) => {
    const items = labels.filter((l) => String(l.groupId) === String(g.id));
    const single = g.selection === "single";
    const name = `lbg_${g.id}`;
    const none = single ? `<label class="lb-pick"><input type="radio" name="${escapeHTML(name)}" value="" ${items.some((l) => picked.includes(String(l.id))) ? "" : "checked"}><span class="lb-pick__none">Không gán</span></label>` : "";
    return `
      <fieldset class="lb-picker" data-label-group="${escapeHTML(String(g.id))}">
        <legend>${escapeHTML(g.name)} <small>${single ? "chọn 1" : "chọn nhiều"}</small></legend>
        <div class="lb-picker__opts">
          ${none}${items.map((l) => `<label class="lb-pick"><input type="${single ? "radio" : "checkbox"}" name="${escapeHTML(name)}" value="${escapeHTML(String(l.id))}" ${picked.includes(String(l.id)) ? "checked" : ""}>${labelChip(l)}</label>`).join("")
            || `<span class="muted">Nhóm này chưa có nhãn.</span>`}
        </div>
      </fieldset>`;
  }).join("");
}
export function readLabelPicker(root) {
  return Array.from(root.querySelectorAll(".lb-picker input:checked")).map((i) => i.value).filter(Boolean);
}

// ---------- Panel quản lý ----------
export async function initLabelsPanel(panel) {
  if (!panel) return;
  panel.innerHTML = `<div class="state"><p>Đang tải nhãn…</p></div>`;
  let products = [];
  try { [, products] = await Promise.all([ensureLabels(true), getProducts()]); }
  catch (err) { panel.innerHTML = `<div class="state"><p>Không tải được dữ liệu nhãn: ${escapeHTML(err.message)}</p></div>`; return; }

  const reload = () => initLabelsPanel(panel);
  const { groups, labels } = getLabelCache();
  const usage = (id) => products.filter((p) => (p.labelIds || []).map(String).includes(String(id))).length;

  panel.innerHTML = `
    <div class="adm-head">
      <div>
        <h2>Nhãn sản phẩm</h2>
        <p class="muted">Nhãn hiện trên thẻ sản phẩm và trang chi tiết. Mỗi <strong>nhóm</strong> là một loại thông tin độc lập; gán nhãn cho sản phẩm ở form sửa sản phẩm.</p>
      </div>
      <button class="btn btn--primary" type="button" data-add-group>+ Thêm nhóm nhãn</button>
    </div>
    <div id="lbForm" hidden></div>
    ${groups.length ? groups.map((g) => {
      const items = labels.filter((l) => String(l.groupId) === String(g.id));
      return `
        <section class="lb-group" data-group="${escapeHTML(String(g.id))}">
          <header class="lb-group__head">
            <div>
              <h3>${escapeHTML(g.name)} <span class="lb-group__mode">${g.selection === "single" ? "Mỗi sản phẩm 1 nhãn" : "Gán được nhiều nhãn"}</span></h3>
              ${g.description ? `<p class="muted">${escapeHTML(g.description)}</p>` : ""}
            </div>
            <div class="lb-group__actions">
              <button class="btn btn--ghost btn--sm" type="button" data-add-label="${escapeHTML(String(g.id))}">+ Thêm nhãn</button>
              <button class="btn btn--text btn--sm" type="button" data-edit-group="${escapeHTML(String(g.id))}">Sửa nhóm</button>
              <button class="btn btn--text btn--sm lb-danger" type="button" data-del-group="${escapeHTML(String(g.id))}">Xóa nhóm</button>
            </div>
          </header>
          ${items.length ? `<ul class="lb-list">${items.map((l) => `
            <li>
              ${labelChip(l)}
              <span class="lb-list__desc">${escapeHTML(l.description || "")}${l.petSafe ? ` <em class="lb-flag">dùng cho bộ lọc "có thú cưng"</em>` : ""}</span>
              <span class="lb-list__use">${usage(l.id)} sản phẩm</span>
              <span class="lb-list__actions">
                <button class="btn btn--text btn--sm" type="button" data-edit-label="${escapeHTML(String(l.id))}">Sửa</button>
                <button class="btn btn--text btn--sm lb-danger" type="button" data-del-label="${escapeHTML(String(l.id))}">Xóa</button>
              </span>
            </li>`).join("")}</ul>` : `<p class="muted lb-empty">Nhóm này chưa có nhãn nào.</p>`}
        </section>`;
    }).join("") : `<div class="state"><p>Chưa có nhóm nhãn nào. Bấm “Thêm nhóm nhãn” để bắt đầu.</p></div>`}`;

  const formBox = panel.querySelector("#lbForm");
  const closeForm = () => { formBox.hidden = true; formBox.innerHTML = ""; };

  function groupForm(group) {
    formBox.hidden = false;
    formBox.innerHTML = `
      <form class="sale-form lb-form" novalidate>
        <h3 class="dash-section-title" style="margin-top:0">${group ? "Sửa nhóm nhãn" : "Thêm nhóm nhãn"}</h3>
        <div class="sale-form__grid">
          <div class="sale-form__group"><label for="lbg_name">Tên nhóm *</label><input id="lbg_name" name="name" type="text" maxlength="40" required value="${escapeHTML(group?.name || "")}" placeholder="vd: Vị trí đặt cây"></div>
          <div class="sale-form__group"><label for="lbg_sel">Kiểu gán</label>
            <select id="lbg_sel" name="selection">
              <option value="single" ${group?.selection !== "multi" ? "selected" : ""}>Mỗi sản phẩm chỉ 1 nhãn trong nhóm</option>
              <option value="multi" ${group?.selection === "multi" ? "selected" : ""}>Một sản phẩm gán được nhiều nhãn</option>
            </select></div>
          <div class="sale-form__group sale-form__full"><label for="lbg_desc">Mô tả</label><input id="lbg_desc" name="description" type="text" maxlength="120" value="${escapeHTML(group?.description || "")}"></div>
        </div>
        <p class="lb-form__err" hidden></p>
        <div class="sale-form__actions"><button class="btn btn--primary" type="submit">Lưu nhóm</button><button class="btn btn--ghost" type="button" data-cancel>Hủy</button></div>
      </form>`;
    const form = formBox.querySelector("form");
    form.querySelector("[data-cancel]").addEventListener("click", closeForm);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get("name")).trim();
      const err = form.querySelector(".lb-form__err");
      const dup = groups.some((g) => g.name.trim().toLowerCase() === name.toLowerCase() && String(g.id) !== String(group?.id));
      if (!name || dup) { err.textContent = !name ? "Vui lòng nhập tên nhóm." : "Đã có nhóm trùng tên."; err.hidden = false; return; }
      const selection = fd.get("selection") === "multi" ? "multi" : "single";
      // Đổi từ "nhiều" sang "1" khi đang có sản phẩm mang ≥ 2 nhãn của nhóm → chặn, tránh dữ liệu mâu thuẫn
      if (group && group.selection === "multi" && selection === "single") {
        const ids = labels.filter((l) => String(l.groupId) === String(group.id)).map((l) => String(l.id));
        const clash = products.filter((p) => (p.labelIds || []).filter((id) => ids.includes(String(id))).length > 1).length;
        if (clash) { err.textContent = `Có ${clash} sản phẩm đang mang nhiều nhãn của nhóm này — gỡ bớt trước khi đổi sang "chỉ 1 nhãn".`; err.hidden = false; return; }
      }
      const data = { name, selection, description: String(fd.get("description")).trim() };
      try {
        if (group) await updateLabelGroup(group.id, data);
        else await createLabelGroup({ ...data, order: nextOrder(groups) });
        showToast("✓ Đã lưu nhóm nhãn");
        reload();
      } catch (ex) { err.textContent = "Không lưu được: " + ex.message; err.hidden = false; }
    });
    form.querySelector("input").focus();
  }

  function labelForm(groupId, label) {
    const group = groups.find((g) => String(g.id) === String(groupId));
    formBox.hidden = false;
    formBox.innerHTML = `
      <form class="sale-form lb-form" novalidate>
        <h3 class="dash-section-title" style="margin-top:0">${label ? "Sửa nhãn" : "Thêm nhãn"} — nhóm “${escapeHTML(group?.name || "")}”</h3>
        <div class="sale-form__grid">
          <div class="sale-form__group"><label for="lb_name">Tên nhãn *</label><input id="lb_name" name="name" type="text" maxlength="40" required value="${escapeHTML(label?.name || "")}"></div>
          <div class="sale-form__group"><label for="lb_desc">Mô tả (hiện khi rê chuột)</label><input id="lb_desc" name="description" type="text" maxlength="120" value="${escapeHTML(label?.description || "")}"></div>
          <div class="sale-form__group sale-form__full"><label>Màu</label><div class="lb-colors">${colorOptions(label?.color || "green")}</div></div>
          <div class="sale-form__group sale-form__full">
            <label class="lb-check"><input type="checkbox" name="petSafe" ${label?.petSafe ? "checked" : ""}> Nhãn này nghĩa là <strong>an toàn với thú cưng</strong> — “Gợi ý chọn cây” sẽ chỉ gợi ý cây mang nhãn này cho khách có nuôi chó mèo</label>
          </div>
          <div class="sale-form__group sale-form__full"><label>Xem trước</label><div id="lbPreview"></div></div>
        </div>
        <p class="lb-form__err" hidden></p>
        <div class="sale-form__actions"><button class="btn btn--primary" type="submit">Lưu nhãn</button><button class="btn btn--ghost" type="button" data-cancel>Hủy</button></div>
      </form>`;
    const form = formBox.querySelector("form");
    const preview = () => {
      const fd = new FormData(form);
      form.querySelector("#lbPreview").innerHTML = labelChip({ name: String(fd.get("name")).trim() || "Tên nhãn", color: fd.get("color"), description: fd.get("description") });
    };
    form.addEventListener("input", preview);
    preview();
    form.querySelector("[data-cancel]").addEventListener("click", closeForm);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get("name")).trim();
      const err = form.querySelector(".lb-form__err");
      const dup = labels.some((l) => String(l.groupId) === String(groupId) && l.name.trim().toLowerCase() === name.toLowerCase() && String(l.id) !== String(label?.id));
      if (!name || dup) { err.textContent = !name ? "Vui lòng nhập tên nhãn." : "Nhóm này đã có nhãn trùng tên."; err.hidden = false; return; }
      const data = { name, color: LABEL_COLORS[fd.get("color")] ? fd.get("color") : "gray", description: String(fd.get("description")).trim(), petSafe: fd.get("petSafe") === "on" };
      try {
        if (label) {
          await updateLabel(label.id, data);
          // Đổi tên / đổi cờ thú cưng → cập nhật lại 2 trường cũ trên các sản phẩm đang mang nhãn
          await ensureLabels(true);
          for (const p of products.filter((x) => (x.labelIds || []).map(String).includes(String(label.id)))) {
            await updateProduct(p.id, legacyFields(p.labelIds, undefined, undefined, p));
          }
        } else {
          await createLabel({ ...data, groupId: String(groupId), order: nextOrder(labels.filter((l) => String(l.groupId) === String(groupId))) });
        }
        showToast("✓ Đã lưu nhãn");
        reload();
      } catch (ex) { err.textContent = "Không lưu được: " + ex.message; err.hidden = false; }
    });
    form.querySelector("input").focus();
  }

  panel.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t || !panel.contains(t)) return;
    if (t.matches("[data-add-group]")) return groupForm(null);
    if (t.dataset.editGroup) return groupForm(groups.find((g) => String(g.id) === t.dataset.editGroup));
    if (t.dataset.addLabel) return labelForm(t.dataset.addLabel, null);
    if (t.dataset.editLabel) { const l = labels.find((x) => String(x.id) === t.dataset.editLabel); return labelForm(l.groupId, l); }

    if (t.dataset.delLabel) {
      const l = labels.find((x) => String(x.id) === t.dataset.delLabel);
      const n = usage(l.id);
      if (!confirm(`Xóa nhãn “${l.name}”?${n ? `\n${n} sản phẩm đang mang nhãn này sẽ được gỡ nhãn.` : ""}`)) return;
      t.disabled = true;
      try { await detachLabels([l.id], products); await deleteLabel(l.id); showToast("Đã xóa nhãn"); reload(); }
      catch (ex) { showToast("Không xóa được: " + ex.message, { icon: "alert" }); t.disabled = false; }
    }
    if (t.dataset.delGroup) {
      const g = groups.find((x) => String(x.id) === t.dataset.delGroup);
      const ids = labels.filter((l) => String(l.groupId) === String(g.id)).map((l) => l.id);
      const n = products.filter((p) => (p.labelIds || []).some((id) => ids.map(String).includes(String(id)))).length;
      if (!confirm(`Xóa nhóm “${g.name}” cùng ${ids.length} nhãn bên trong?${n ? `\n${n} sản phẩm đang dùng sẽ được gỡ các nhãn này.` : ""}`)) return;
      t.disabled = true;
      try {
        await detachLabels(ids, products);
        for (const id of ids) await deleteLabel(id);
        await deleteLabelGroup(g.id);
        showToast("Đã xóa nhóm nhãn");
        reload();
      } catch (ex) { showToast("Không xóa được: " + ex.message, { icon: "alert" }); t.disabled = false; }
    }
  }, { signal: (panel._lbAbort = (panel._lbAbort?.abort(), new AbortController())).signal });
}
