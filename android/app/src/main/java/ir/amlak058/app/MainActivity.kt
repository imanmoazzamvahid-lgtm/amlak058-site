package ir.amlak058.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.OTP
import io.github.jan.supabase.auth.currentUserOrNull
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.storage.storage
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID
import kotlin.time.Duration.Companion.hours

private const val SUPABASE_URL = "https://lsttrmnxauaviyuipnim.supabase.co"
private const val SUPABASE_KEY = "sb_publishable_V3ZIfuzEZ4y7KUY88lyv_Q_wF6kQAcb"
private val Brand = Color(0xFFB3262D)
private val Muted = Color(0xFF777777)
private val Page = Color(0xFFF7F7F7)

private val supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY) {
    install(Auth)
    install(Postgrest)
    install(Storage)
}

@Serializable
data class Property(
    val id: Long,
    val title: String? = null,
    @SerialName("main_category") val mainCategory: String? = null,
    @SerialName("sub_category") val subCategory: String? = null,
    @SerialName("property_type") val propertyType: String? = null,
    @SerialName("transaction_type") val transactionType: String? = null,
    val price: Long? = null,
    val deposit: Long? = null,
    @SerialName("monthly_rent") val monthlyRent: Long? = null,
    val area: Double? = null,
    val city: String? = null,
    val address: String? = null,
    val description: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("image_urls") val imageUrls: List<String> = emptyList(),
    val status: String? = null,
    @SerialName("owner_id") val ownerId: String? = null
)

@Serializable
data class PropertyDraft(
    val title: String,
    @SerialName("main_category") val mainCategory: String,
    @SerialName("sub_category") val subCategory: String,
    @SerialName("property_type") val propertyType: String,
    @SerialName("transaction_type") val transactionType: String,
    val price: Long? = null,
    val deposit: Long? = null,
    @SerialName("monthly_rent") val monthlyRent: Long? = null,
    val area: Double? = null,
    val city: String = "بجنورد",
    val address: String? = null,
    val description: String? = null,
    val phone: String? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("image_urls") val imageUrls: List<String> = emptyList(),
    @SerialName("owner_id") val ownerId: String,
    val status: String = "pending"
)

private val listingColumns = Columns.raw("id,title,main_category,sub_category,property_type,transaction_type,price,deposit,monthly_rent,area,city,address,description,image_url,image_urls,status,owner_id")

private suspend fun loadApproved(): List<Property> =
    supabase.from("properties").select(columns = listingColumns) {
        filter { eq("status", "approved") }
        order("created_at", Order.DESCENDING)
    }.decodeList()

private suspend fun loadMine(uid: String): List<Property> =
    supabase.from("properties").select(columns = listingColumns) {
        filter { eq("owner_id", uid) }
        order("created_at", Order.DESCENDING)
    }.decodeList()

private fun iranPhone(value: String): String {
    var digits = value.filter(Char::isDigit)
    if (digits.startsWith("0098")) digits = digits.drop(4)
    else if (digits.startsWith("98")) digits = digits.drop(2)
    if (digits.startsWith("0")) digits = digits.drop(1)
    require(digits.matches(Regex("^9\\d{9}$"))) { "شماره موبایل معتبر ایران را وارد کنید." }
    return "+98$digits"
}

private fun toman(value: Long?): String =
    if (value == null || value <= 0) "توافقی"
    else NumberFormat.getNumberInstance(Locale("fa", "IR")).format(value) + " تومان"

private fun priceText(p: Property): String =
    if ((p.transactionType ?: "").contains("اجاره")) "رهن ${toman(p.deposit)} | اجاره ${toman(p.monthlyRent ?: p.price)}"
    else toman(p.price)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { AmlakApp() }
    }
}

@Composable
private fun AmlakApp() {
    var tab by remember { mutableIntStateOf(0) }
    var ads by remember { mutableStateOf<List<Property>>(emptyList()) }
    var mine by remember { mutableStateOf<List<Property>>(emptyList()) }
    var uid by remember { mutableStateOf<String?>(null) }
    var phone by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Property?>(null) }
    var favorites by remember { mutableStateOf(setOf<Long>()) }
    val scope = rememberCoroutineScope()

    suspend fun refreshAds() {
        busy = true
        try { ads = loadApproved(); message = null }
        catch (e: Exception) { message = "دریافت آگهی‌ها ناموفق بود: ${e.message ?: "خطای ارتباط"}" }
        finally { busy = false }
    }
    suspend fun refreshMine() {
        val id = uid ?: return
        try { mine = loadMine(id) }
        catch (e: Exception) { message = "دریافت آگهی‌های شما ناموفق بود: ${e.message ?: "خطای ارتباط"}" }
    }

    LaunchedEffect(Unit) {
        uid = supabase.auth.currentUserOrNull()?.id
        phone = supabase.auth.currentUserOrNull()?.phone.orEmpty()
        refreshAds()
        if (uid != null) refreshMine()
    }

    MaterialTheme(colorScheme = lightColorScheme(primary = Brand, onPrimary = Color.White, background = Page, surface = Color.White)) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Scaffold(
                containerColor = Page,
                snackbarHost = {
                    message?.let { text ->
                        Snackbar(modifier = Modifier.padding(10.dp), action = {
                            TextButton(onClick = { message = null }) { Text("بستن") }
                        }) { Text(text, maxLines = 4) }
                    }
                },
                bottomBar = {
                    NavigationBar(containerColor = Color.White) {
                        listOf(
                            Triple("خانه", Icons.Default.Home, 0),
                            Triple("دسته‌ها", Icons.Default.Category, 1),
                            Triple("ثبت آگهی", Icons.Default.AddCircle, 2),
                            Triple("نشان‌شده", Icons.Default.FavoriteBorder, 3),
                            Triple("حساب من", Icons.Default.Person, 4)
                        ).forEach { (label, icon, index) ->
                            NavigationBarItem(
                                selected = tab == index, onClick = { tab = index },
                                icon = { Icon(icon, contentDescription = label) },
                                label = { Text(label, fontSize = 10.sp) }
                            )
                        }
                    }
                }
            ) { padding ->
                when (tab) {
                    0 -> HomePage(
                        Modifier.padding(padding), ads, busy, favorites,
                        onRefresh = { scope.launch { refreshAds() } },
                        onFavorite = { p -> favorites = if (p.id in favorites) favorites - p.id else favorites + p.id },
                        onOpen = { selected = it }, onCategory = { tab = 1 }
                    )
                    1 -> CategoryPage(Modifier.padding(padding), onChoose = { chosen ->
                        ads = ads.filter { (it.transactionType ?: "").contains(chosen) || (it.mainCategory ?: "").contains(chosen) }
                        tab = 0
                    }, onAll = { scope.launch { refreshAds() }; tab = 0 })
                    2 -> if (uid == null) {
                        LoginPage(Modifier.padding(padding), busy,
                            onSend = { raw -> scope.launch {
                                busy = true
                                try {
                                    val normalized = iranPhone(raw)
                                    supabase.auth.signInWith(OTP) { this.phone = normalized }
                                    phone = normalized
                                    message = "کد تأیید پیامک شد."
                                } catch (e: Exception) { message = e.message ?: "ارسال کد انجام نشد." }
                                finally { busy = false }
                            } },
                            onVerify = { raw, code -> scope.launch {
                                busy = true
                                try {
                                    val normalized = iranPhone(raw)
                                    supabase.auth.verifyPhoneOtp(type = OtpType.Phone.SMS, phone = normalized, token = code)
                                    uid = supabase.auth.currentUserOrNull()?.id
                                    phone = normalized
                                    message = "ورود با موفقیت انجام شد."
                                    refreshMine()
                                } catch (e: Exception) { message = e.message ?: "کد تأیید معتبر نیست." }
                                finally { busy = false }
                            } }
                        )
                    } else NewAdPage(Modifier.padding(padding), uid!!, phone, busy, onSubmit = { draft -> scope.launch {
                        busy = true
                        try {
                            supabase.from("properties").insert(draft)
                            message = "آگهی ثبت شد و پس از بررسی مدیر منتشر می‌شود."
                            refreshMine()
                            tab = 4
                        } catch (e: Exception) { message = "ثبت آگهی انجام نشد: ${e.message ?: "خطای ارتباط"}" }
                        finally { busy = false }
                    } })
                    3 -> PropertyListPage(Modifier.padding(padding), "آگهی‌های نشان‌شده",
                        ads.filter { it.id in favorites }, favorites,
                        onFavorite = { p -> favorites = favorites - p.id }, onOpen = { selected = it },
                        emptyText = "هنوز آگهی‌ای نشان نکرده‌اید.")
                    else -> AccountPage(Modifier.padding(padding), uid, phone, mine,
                        onLogin = { tab = 2 }, onOpen = { selected = it },
                        onRefresh = { scope.launch { refreshMine() } },
                        onLogout = { scope.launch {
                            try { supabase.auth.signOut() } catch (_: Exception) {}
                            uid = null; phone = ""; mine = emptyList()
                            message = "از حساب خارج شدید."
                        } })
                }
            }
            selected?.let { p ->
                PropertyDialog(p, p.id in favorites,
                    onFavorite = { favorites = if (p.id in favorites) favorites - p.id else favorites + p.id },
                    onClose = { selected = null })
            }
        }
    }
}

@Composable
private fun HomePage(
    modifier: Modifier, ads: List<Property>, busy: Boolean, favorites: Set<Long>,
    onRefresh: () -> Unit, onFavorite: (Property) -> Unit, onOpen: (Property) -> Unit, onCategory: () -> Unit
) {
    var search by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("همه") }
    val shown = ads.filter { p ->
        val textOk = search.isBlank() || listOfNotNull(p.title, p.address, p.city, p.mainCategory).any { it.contains(search, true) }
        val typeOk = filter == "همه" || (p.transactionType ?: "").contains(filter) || (p.mainCategory ?: "").contains(filter)
        textOk && typeOk
    }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth().background(Color.White).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("املاک ۰۵۸", color = Brand, fontSize = 22.sp, fontWeight = FontWeight.Black)
                    Text("بازار آنلاین ملک بجنورد", color = Muted, fontSize = 11.sp)
                }
                IconButton(onClick = onRefresh) { Icon(Icons.Default.Refresh, contentDescription = "به‌روزرسانی") }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text("ملک موردنظرتان را پیدا کنید", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text("آگهی‌های تأییدشده املاک ۰۵۸", color = Muted, fontSize = 11.sp)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(),
                    placeholder = { Text("جست‌وجوی عنوان، محله یا نوع ملک") },
                    leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true,
                    shape = RoundedCornerShape(12.dp))
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text("دسته‌بندی‌ها", fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf("همه", "خرید", "رهن و اجاره", "زمین", "تجاری").forEach { v ->
                        FilterChip(selected = filter == v, onClick = { filter = v }, label = { Text(v, fontSize = 10.sp) })
                    }
                }
                TextButton(onClick = onCategory) { Text("مشاهده دسته‌بندی‌ها") }
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("آگهی‌های تازه", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${shown.size} آگهی", color = Muted, fontSize = 11.sp)
            }
        }
        if (busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        if (shown.isEmpty()) item { EmptyMessage(if (ads.isEmpty()) "هنوز آگهی تأییدشده‌ای برای نمایش وجود ندارد." else "نتیجه‌ای پیدا نشد.") }
        items(shown, key = { it.id }) { p ->
            PropertyCard(p, p.id in favorites, { onFavorite(p) }, { onOpen(p) }, Modifier.padding(horizontal = 12.dp))
        }
    }
}

@Composable
private fun CategoryPage(modifier: Modifier, onChoose: (String) -> Unit, onAll: () -> Unit) {
    Column(modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("دسته‌بندی املاک", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        listOf("خرید", "رهن و اجاره", "زمین", "تجاری", "مسکونی", "اداری").forEach { name ->
            Surface(Modifier.fillMaxWidth().clickable { onChoose(name) }, color = Color.White, shape = RoundedCornerShape(10.dp)) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(name, Modifier.weight(1f))
                    Icon(Icons.Default.ChevronLeft, null, tint = Brand)
                }
            }
        }
        OutlinedButton(onClick = onAll, Modifier.fillMaxWidth()) { Text("نمایش همه آگهی‌ها") }
    }
}

@Composable
private fun PropertyListPage(
    modifier: Modifier, title: String, data: List<Property>, favorites: Set<Long>,
    onFavorite: (Property) -> Unit, onOpen: (Property) -> Unit, emptyText: String
) {
    Column(modifier.fillMaxSize()) {
        Text(title, Modifier.padding(18.dp), fontSize = 20.sp, fontWeight = FontWeight.Bold)
        if (data.isEmpty()) EmptyMessage(emptyText)
        else LazyColumn(contentPadding = PaddingValues(bottom = 20.dp)) {
            items(data, key = { it.id }) { p ->
                PropertyCard(p, p.id in favorites, { onFavorite(p) }, { onOpen(p) }, Modifier.padding(horizontal = 12.dp))
            }
        }
    }
}

@Composable
private fun PropertyCard(p: Property, favorite: Boolean, onFavorite: () -> Unit, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    var photo by remember(p.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(p.id) {
        val raw = p.imageUrl ?: p.imageUrls.firstOrNull()
        if (!raw.isNullOrBlank()) photo = if (raw.startsWith("http")) raw else try {
            supabase.storage.from("property-images").createSignedUrl(raw, 1.hours)
        } catch (_: Exception) { null }
    }
    Surface(modifier.fillMaxWidth().clickable(onClick = onOpen), color = Color.White, shape = RoundedCornerShape(12.dp), shadowElevation = 1.dp) {
        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(112.dp, 105.dp).background(Color(0xFFF0F0F0), RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                if (photo != null) AsyncImage(photo, p.title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                else Icon(Icons.Default.HomeWork, null, tint = Color.LightGray, modifier = Modifier.size(34.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.transactionType ?: p.mainCategory ?: "آگهی ملک", color = Brand, fontSize = 10.sp, modifier = Modifier.weight(1f))
                    IconButton(onClick = onFavorite, modifier = Modifier.size(28.dp)) {
                        Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null, tint = if (favorite) Brand else Muted, modifier = Modifier.size(18.dp))
                    }
                }
                Text(p.title ?: "ملک بدون عنوان", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
                Text(listOfNotNull(p.city, p.address).joinToString("، "), color = Muted, fontSize = 10.sp, maxLines = 1)
                Text(priceText(p), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                p.area?.let { Text("$it متر", color = Muted, fontSize = 10.sp) }
            }
        }
    }
}

@Composable
private fun PropertyDialog(p: Property, favorite: Boolean, onFavorite: () -> Unit, onClose: () -> Unit) {
    var photo by remember(p.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(p.id) {
        val raw = p.imageUrl ?: p.imageUrls.firstOrNull()
        if (!raw.isNullOrBlank()) photo = if (raw.startsWith("http")) raw else try {
            supabase.storage.from("property-images").createSignedUrl(raw, 1.hours)
        } catch (_: Exception) { null }
    }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(p.title ?: "جزئیات آگهی", fontWeight = FontWeight.Bold, fontSize = 17.sp) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (photo != null) AsyncImage(photo, null, Modifier.fillMaxWidth().height(160.dp), contentScale = ContentScale.Crop)
                Text(priceText(p), color = Brand, fontWeight = FontWeight.Bold)
                Text(listOfNotNull(p.transactionType, p.mainCategory, p.propertyType).joinToString(" • "), fontSize = 12.sp)
                Text(listOfNotNull(p.city, p.address, p.area?.let { "$it متر" }).joinToString("، "), fontSize = 12.sp, color = Muted)
                p.description?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 13.sp) }
            }
        },
        confirmButton = { TextButton(onClick = onFavorite) { Text(if (favorite) "حذف نشان" else "نشان کردن") } },
        dismissButton = { TextButton(onClick = onClose) { Text("بستن") } }
    )
}

@Composable
private fun LoginPage(modifier: Modifier, busy: Boolean, onSend: (String) -> Unit, onVerify: (String, String) -> Unit) {
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    Column(modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Default.PhoneAndroid, null, tint = Brand, modifier = Modifier.size(46.dp))
        Spacer(Modifier.height(10.dp))
        Text("ورود به املاک ۰۵۸", fontWeight = FontWeight.Bold, fontSize = 21.sp)
        Text("برای ثبت و مدیریت آگهی، شماره موبایل را تأیید کنید.", color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(phone, { phone = it; sent = false }, Modifier.fillMaxWidth(),
            label = { Text("شماره موبایل") }, placeholder = { Text("0915xxxxxxx") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), singleLine = true)
        if (sent) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(code, { code = it }, Modifier.fillMaxWidth(),
                label = { Text("کد پیامک‌شده") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = { if (sent) onVerify(phone, code) else { sent = true; onSend(phone) } },
            enabled = !busy && phone.isNotBlank() && (!sent || code.length >= 4), modifier = Modifier.fillMaxWidth()) {
            if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
            else Text(if (sent) "تأیید و ورود" else "دریافت کد پیامکی")
        }
        if (sent) TextButton(onClick = { sent = false; code = "" }) { Text("اصلاح شماره") }
    }
}

@Composable
private fun NewAdPage(modifier: Modifier, uid: String, phone: String, busy: Boolean, onSubmit: (PropertyDraft) -> Unit) {
    var title by remember { mutableStateOf("") }
    var deal by remember { mutableStateOf("خرید و فروش") }
    var category by remember { mutableStateOf("مسکونی") }
    var kind by remember { mutableStateOf("آپارتمان") }
    var price by remember { mutableStateOf("") }
    var deposit by remember { mutableStateOf("") }
    var rent by remember { mutableStateOf("") }
    var area by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var contact by remember { mutableStateOf(phone.removePrefix("+98").let { if (it.isNotBlank()) "0$it" else "" }) }
    var paths by remember { mutableStateOf<List<String>>(emptyList()) }
    var uploading by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isNotEmpty()) scope.launch {
            uploading = true
            try {
                uris.take(8 - paths.size).forEach { uri ->
                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw IllegalStateException("خواندن تصویر ممکن نشد.")
                    val path = "pending/$uid/${UUID.randomUUID()}.jpg"
                    supabase.storage.from("property-images").upload(path, bytes) { upsert = false }
                    paths = paths + path
                }
                formError = null
            } catch (e: Exception) { formError = e.message ?: "بارگذاری تصویر ناموفق بود." }
            finally { uploading = false }
        }
    }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        item {
            Text("ثبت آگهی جدید", fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text("آگهی پس از بررسی مدیر منتشر خواهد شد.", color = Muted, fontSize = 11.sp)
        }
        item { FormInput("عنوان آگهی", title, { title = it }, "مثلاً آپارتمان دوخوابه فردوسی") }
        item {
            Text("نوع معامله", fontSize = 12.sp, color = Muted)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("خرید و فروش", "رهن و اجاره").forEach { v ->
                    FilterChip(selected = deal == v, onClick = { deal = v }, label = { Text(v) })
                }
            }
        }
        item {
            Text("دسته ملک", fontSize = 12.sp, color = Muted)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("مسکونی", "تجاری", "زمین", "اداری").forEach { v ->
                    FilterChip(selected = category == v, onClick = { category = v }, label = { Text(v) })
                }
            }
        }
        item { FormInput("نوع ملک", kind, { kind = it }, "آپارتمان، خانه، مغازه...") }
        item { FormInput("قیمت (تومان)", price, { price = it }, "عدد به تومان", KeyboardType.Number) }
        if (deal == "رهن و اجاره") {
            item { FormInput("مبلغ رهن (تومان)", deposit, { deposit = it }, "مبلغ رهن", KeyboardType.Number) }
            item { FormInput("اجاره ماهانه (تومان)", rent, { rent = it }, "اجاره ماهانه", KeyboardType.Number) }
        }
        item { FormInput("متراژ (متر)", area, { area = it }, "مثلاً ۱۲۰", KeyboardType.Decimal) }
        item { FormInput("محله و نشانی", address, { address = it }, "بجنورد، خیابان ...") }
        item { FormInput("شماره تماس آگهی", contact, { contact = it }, "0915xxxxxxx", KeyboardType.Phone) }
        item { FormInput("توضیحات", description, { description = it }, "ویژگی‌ها و توضیحات ملک", multiline = true) }
        item {
            OutlinedButton(onClick = { picker.launch("image/*") }, enabled = !uploading && paths.size < 8, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.AddPhotoAlternate, null)
                Spacer(Modifier.width(6.dp))
                Text(if (uploading) "در حال بارگذاری..." else "انتخاب تصویر (${paths.size}/۸)")
            }
        }
        if (formError != null) item { Text(formError!!, color = Brand, fontSize = 12.sp) }
        item {
            Button(onClick = {
                try {
                    require(title.isNotBlank()) { "عنوان آگهی را وارد کنید." }
                    val priceValue = price.filter(Char::isDigit).toLongOrNull()
                    val depositValue = deposit.filter(Char::isDigit).toLongOrNull()
                    val rentValue = rent.filter(Char::isDigit).toLongOrNull()
                    val areaValue = area.replace(",", ".").toDoubleOrNull()
                    require(deal != "خرید و فروش" || (priceValue ?: 0) > 0) { "قیمت فروش را وارد کنید." }
                    require(deal != "رهن و اجاره" || (depositValue ?: 0) > 0 || (rentValue ?: 0) > 0) { "مبلغ رهن یا اجاره را وارد کنید." }
                    onSubmit(PropertyDraft(
                        title = title.trim(), mainCategory = category, subCategory = kind, propertyType = kind,
                        transactionType = deal, price = priceValue ?: rentValue, deposit = depositValue,
                        monthlyRent = rentValue, area = areaValue, address = address.takeIf { it.isNotBlank() },
                        description = description.takeIf { it.isNotBlank() }, phone = contact.takeIf { it.isNotBlank() },
                        imageUrl = paths.firstOrNull(), imageUrls = paths, ownerId = uid
                    ))
                } catch (e: Exception) { formError = e.message ?: "اطلاعات آگهی را بررسی کنید." }
            }, enabled = !busy && !uploading, modifier = Modifier.fillMaxWidth()) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                else Text("ثبت و ارسال برای بررسی")
            }
        }
    }
}

@Composable
private fun FormInput(
    label: String, value: String, onValue: (String) -> Unit, hint: String,
    type: KeyboardType = KeyboardType.Text, multiline: Boolean = false
) {
    OutlinedTextField(value, onValue, Modifier.fillMaxWidth(),
        label = { Text(label) }, placeholder = { Text(hint) },
        keyboardOptions = KeyboardOptions(keyboardType = type),
        singleLine = !multiline, minLines = if (multiline) 3 else 1)
}

@Composable
private fun AccountPage(
    modifier: Modifier, uid: String?, phone: String, mine: List<Property>,
    onLogin: () -> Unit, onOpen: (Property) -> Unit, onRefresh: () -> Unit, onLogout: () -> Unit
) {
    Column(modifier.fillMaxSize()) {
        Text("حساب کاربری", Modifier.padding(18.dp), fontSize = 20.sp, fontWeight = FontWeight.Bold)
        if (uid == null) {
            EmptyMessage("برای مشاهده آگهی‌ها و ثبت ملک، وارد حساب شوید.")
            Button(onClick = onLogin, Modifier.fillMaxWidth().padding(horizontal = 18.dp)) { Text("ورود با شماره موبایل") }
        } else {
            Column(Modifier.fillMaxWidth().background(Color.White).padding(16.dp)) {
                Text("حساب شما فعال است", fontWeight = FontWeight.Bold)
                Text(phone.ifBlank { "کاربر املاک ۰۵۸" }, color = Muted, fontSize = 12.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onRefresh) { Text("به‌روزرسانی") }
                    TextButton(onClick = onLogout) { Text("خروج از حساب") }
                }
            }
            Text("آگهی‌های من (${mine.size})", Modifier.padding(16.dp), fontWeight = FontWeight.Bold)
            if (mine.isEmpty()) EmptyMessage("هنوز آگهی ثبت نکرده‌اید.")
            else LazyColumn {
                items(mine, key = { it.id }) { p ->
                    Column(Modifier.fillMaxWidth().background(Color.White).clickable { onOpen(p) }.padding(14.dp)) {
                        Text(p.title ?: "آگهی بدون عنوان", fontWeight = FontWeight.SemiBold)
                        Text(priceText(p), fontSize = 12.sp)
                        Text("وضعیت: " + when (p.status) {
                            "pending" -> "در انتظار بررسی"
                            "approved" -> "منتشرشده"
                            "rejected" -> "ردشده"
                            else -> p.status ?: "نامشخص"
                        }, color = Muted, fontSize = 11.sp)
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun EmptyMessage(text: String) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Default.HomeWork, null, tint = Color.LightGray, modifier = Modifier.size(38.dp))
        Spacer(Modifier.height(8.dp))
        Text(text, color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}
