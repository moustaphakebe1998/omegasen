"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ImagePreview } from "@/components/manage/media/image-upload";
import { ConfirmDialog } from "@/components/manage/settings/confirm-dialog";
import { useRestaurant } from "@/components/manage/settings/use-restaurant";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CategoryDialog } from "./category-dialog";
import { ProductEditor } from "./product-editor";
import {
  type Category,
  menuKey,
  moveItem,
  type Product,
  promoActive,
} from "./utils";

type Confirm =
  | { kind: "category"; item: Category }
  | { kind: "product"; item: Product }
  | null;

function ProductRow({
  product,
  currency,
  index,
  total,
  onToggle,
  onEdit,
  onDelete,
  onMove,
}: {
  product: Product;
  currency: string;
  index: number;
  total: number;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const switchId = `avail-${product.id}`;
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border bg-background p-2.5 transition-colors hover:border-primary/30 sm:grid-cols-[auto_minmax(0,1fr)_auto]",
        (!product.is_available || !product.is_visible) && "bg-muted/40",
      )}
    >
      <ImagePreview
        src={product.image_thumb_url}
        alt={product.name}
        className={cn(
          "size-16 shrink-0 rounded-lg border sm:size-[4.5rem]",
          !product.is_available && "opacity-60 grayscale",
        )}
      />
      <div className="min-w-0">
        <button
          type="button"
          onClick={onEdit}
          className="block max-w-full truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {product.name}
        </button>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
          {promoActive(product) ? (
            <>
              <span className="font-semibold whitespace-nowrap text-primary">
                {formatMoney(product.effective_price, currency)}
              </span>
              <span className="whitespace-nowrap text-muted-foreground line-through">
                {formatMoney(product.price, currency)}
              </span>
            </>
          ) : (
            <span className="font-semibold whitespace-nowrap">
              {formatMoney(product.price, currency)}
            </span>
          )}
          {product.promo_price != null && !promoActive(product) && (
            <span className="text-xs text-muted-foreground">
              Promo programmée
            </span>
          )}
          {product.option_groups.length > 0 && (
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {product.option_groups.length} groupe
              {product.option_groups.length > 1 ? "s" : ""} d&apos;options
            </span>
          )}
        </div>
        {(!product.is_available ||
          !product.is_visible ||
          product.is_featured) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {!product.is_available && (
              <Badge variant="destructive">Indisponible</Badge>
            )}
            {!product.is_visible && (
              <Badge variant="secondary">
                <EyeOff />
                Masqué
              </Badge>
            )}
            {product.is_featured && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <Star />
                Mis en avant
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 border-t pt-2 sm:col-span-1 sm:border-0 sm:pt-0">
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={product.is_available}
            onCheckedChange={onToggle}
            aria-label={`${product.name} : disponible`}
          />
          <label htmlFor={switchId} className="text-xs text-muted-foreground">
            Disponible
          </label>
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Monter ${product.name}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Descendre ${product.name}`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Modifier ${product.name}`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Supprimer ${product.name}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}

export function MenuEditor({ rid }: { rid: string }) {
  const qc = useQueryClient();
  const restaurant = useRestaurant(rid);
  const menu = useQuery({
    queryKey: menuKey(rid),
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/menu", {
          params: { path: { restaurant_id: rid } },
        }),
      ),
  });
  const currency = restaurant.data?.currency ?? "EUR";

  const [catDialog, setCatDialog] = useState<{
    open: boolean;
    category: Category | null;
  }>({
    open: false,
    category: null,
  });
  const [prodDialog, setProdDialog] = useState<{
    open: boolean;
    product: Product | null;
    categoryId: string;
  }>({
    open: false,
    product: null,
    categoryId: "",
  });
  const [confirm, setConfirm] = useState<Confirm>(null);

  const categories: Category[] = [...(menu.data ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      ...c,
      products: [...c.products].sort((a, b) => a.sort_order - b.sort_order),
    }));

  const refresh = () => qc.invalidateQueries({ queryKey: menuKey(rid) });

  const setMenu = (fn: (old: Category[]) => Category[]) =>
    qc.setQueryData<Category[]>(menuKey(rid), (old) => (old ? fn(old) : old));

  const moveCategory = async (index: number, delta: number) => {
    const ids = moveItem(categories, index, delta).map((c) => c.id);
    setMenu((old) => old.map((c) => ({ ...c, sort_order: ids.indexOf(c.id) })));
    try {
      await unwrap(
        api.PUT("/api/restaurants/{restaurant_id}/menu/categories/order", {
          params: { path: { restaurant_id: rid } },
          body: { ids },
        }),
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      refresh();
    }
  };

  const moveProduct = async (
    category: Category,
    index: number,
    delta: number,
  ) => {
    const ids = moveItem(category.products, index, delta).map((p) => p.id);
    setMenu((old) =>
      old.map((c) =>
        c.id === category.id
          ? {
              ...c,
              products: c.products.map((p) => ({
                ...p,
                sort_order: ids.indexOf(p.id),
              })),
            }
          : c,
      ),
    );
    try {
      await unwrap(
        api.PUT(
          "/api/restaurants/{restaurant_id}/menu/categories/{category_id}/products/order",
          {
            params: { path: { restaurant_id: rid, category_id: category.id } },
            body: { ids },
          },
        ),
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      refresh();
    }
  };

  const toggleCategory = async (category: Category, is_visible: boolean) => {
    setMenu((old) =>
      old.map((c) => (c.id === category.id ? { ...c, is_visible } : c)),
    );
    try {
      await unwrap(
        api.PATCH(
          "/api/restaurants/{restaurant_id}/menu/categories/{category_id}",
          {
            params: { path: { restaurant_id: rid, category_id: category.id } },
            body: { is_visible },
          },
        ),
      );
      toast.success(is_visible ? "Catégorie visible" : "Catégorie masquée");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      refresh();
    }
  };

  const toggleProduct = async (product: Product, is_available: boolean) => {
    setMenu((old) =>
      old.map((c) => ({
        ...c,
        products: c.products.map((p) =>
          p.id === product.id ? { ...p, is_available } : p,
        ),
      })),
    );
    try {
      await unwrap(
        api.POST(
          "/api/restaurants/{restaurant_id}/menu/products/{product_id}/availability",
          {
            params: { path: { restaurant_id: rid, product_id: product.id } },
            body: { is_available },
          },
        ),
      );
      toast.success(
        `${product.name} : ${is_available ? "disponible" : "indisponible"}`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      refresh();
    }
  };

  const doDelete = async (): Promise<boolean> => {
    if (!confirm) return true;
    try {
      if (confirm.kind === "category") {
        await unwrap(
          api.DELETE(
            "/api/restaurants/{restaurant_id}/menu/categories/{category_id}",
            {
              params: {
                path: { restaurant_id: rid, category_id: confirm.item.id },
              },
            },
          ),
        );
        toast.success("Catégorie supprimée");
      } else {
        await unwrap(
          api.DELETE(
            "/api/restaurants/{restaurant_id}/menu/products/{product_id}",
            {
              params: {
                path: { restaurant_id: rid, product_id: confirm.item.id },
              },
            },
          ),
        );
        toast.success("Produit supprimé");
      }
      await refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const openNewProduct = (categoryId: string) =>
    setProdDialog({ open: true, product: null, categoryId });

  const loading = menu.isPending || restaurant.isPending;

  return (
    <>
      <PageHeader
        title="Menu"
        description="Catégories, produits, prix, options et disponibilités. Les changements sont visibles immédiatement par vos clients."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setCatDialog({ open: true, category: null })}
            >
              <FolderPlus />
              Nouvelle catégorie
            </Button>
            <Button
              disabled={categories.length === 0}
              onClick={() => openNewProduct(categories[0]?.id ?? "")}
            >
              <Plus />
              Nouveau produit
            </Button>
          </>
        }
      />

      {loading ? (
        <div
          className="grid gap-4"
          aria-busy="true"
          aria-label="Chargement de la carte"
        >
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : menu.isError ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage(menu.error)}{" "}
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => menu.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Votre carte est vide"
          description="Commencez par créer une catégorie (ex. Plats, Boissons), puis ajoutez-y vos produits."
          action={
            <Button
              onClick={() => setCatDialog({ open: true, category: null })}
            >
              <FolderPlus />
              Créer une première catégorie
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {categories.map((cat, ci) => {
            const visId = `cat-vis-${cat.id}`;
            return (
              <Card
                key={cat.id}
                className={cn(
                  "gap-3 rounded-2xl py-4 sm:py-5",
                  !cat.is_visible && "border-dashed",
                )}
              >
                <CardHeader className="flex items-center gap-2 px-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-lg font-semibold">
                      <span className="min-w-0 truncate">{cat.name}</span>
                      {!cat.is_visible && (
                        <Badge variant="secondary">
                          <EyeOff />
                          Masquée
                        </Badge>
                      )}
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {cat.products.length} produit
                        {cat.products.length > 1 ? "s" : ""}
                      </span>
                    </h2>
                    {cat.description && (
                      <p className="text-sm text-muted-foreground">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      id={visId}
                      checked={cat.is_visible}
                      onCheckedChange={(v) => toggleCategory(cat, v)}
                      aria-label={`Catégorie ${cat.name} visible`}
                    />
                    <label
                      htmlFor={visId}
                      className="hidden text-xs text-muted-foreground sm:inline"
                    >
                      Visible
                    </label>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Monter la catégorie ${cat.name}`}
                      disabled={ci === 0}
                      onClick={() => moveCategory(ci, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Descendre la catégorie ${cat.name}`}
                      disabled={ci === categories.length - 1}
                      onClick={() => moveCategory(ci, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions pour ${cat.name}`}
                        >
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openNewProduct(cat.id)}
                        >
                          <Plus />
                          Ajouter un produit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setCatDialog({ open: true, category: cat })
                          }
                        >
                          <Pencil />
                          Renommer / modifier
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setConfirm({ kind: "category", item: cat })
                          }
                        >
                          <Trash2 />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 px-4 sm:px-5">
                  {cat.products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun produit dans cette catégorie.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {cat.products.map((p, pi) => (
                        <ProductRow
                          key={p.id}
                          product={p}
                          currency={currency}
                          index={pi}
                          total={cat.products.length}
                          onToggle={(v) => toggleProduct(p, v)}
                          onEdit={() =>
                            setProdDialog({
                              open: true,
                              product: p,
                              categoryId: cat.id,
                            })
                          }
                          onDelete={() =>
                            setConfirm({ kind: "product", item: p })
                          }
                          onMove={(d) => moveProduct(cat, pi, d)}
                        />
                      ))}
                    </ul>
                  )}
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openNewProduct(cat.id)}
                    >
                      <Plus />
                      Ajouter un produit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CategoryDialog
        rid={rid}
        category={catDialog.category}
        open={catDialog.open}
        onOpenChange={(open) => setCatDialog((s) => ({ ...s, open }))}
      />
      {restaurant.data && (
        <ProductEditor
          rid={rid}
          currency={currency}
          defaultVatBp={restaurant.data.vat_rate_bp}
          categories={categories}
          product={prodDialog.product}
          defaultCategoryId={prodDialog.categoryId}
          open={prodDialog.open}
          onOpenChange={(open) => setProdDialog((s) => ({ ...s, open }))}
        />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        confirmLabel="Supprimer"
        title={
          confirm?.kind === "category"
            ? `Supprimer la catégorie « ${confirm.item.name} » ?`
            : `Supprimer « ${confirm?.item.name ?? ""} » ?`
        }
        description={
          confirm?.kind === "category"
            ? `Ses ${confirm.item.products.length} produit(s) seront également retirés de la carte. Les commandes passées restent consultables.`
            : "Le produit sera retiré de la carte. Les commandes passées restent consultables."
        }
        onConfirm={doDelete}
      />
    </>
  );
}
