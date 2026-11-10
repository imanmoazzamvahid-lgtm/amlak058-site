package ir.amlak058.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Brand = Color(0xFFE53946)
private val Ink = Color(0xFF242424)
private val Muted = Color(0xFF777777)
private val Canvas = Color(0xFFF6F6F6)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Amlak058App() }
    }
}

@Composable
private fun Amlak058App() {
    var selectedTab by remember { mutableIntStateOf(0) }
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Brand,
            onPrimary = Color.White,
            background = Canvas,
            surface = Color.White,
            onSurface = Ink
        )
    ) {
        Scaffold(
            containerColor = Canvas,
            bottomBar = {
                NavigationBar(containerColor = Color.White) {
                    val items = listOf(
                        Triple("خانه", Icons.Default.Home, 0),
                        Triple("دسته‌ها", Icons.Default.Category, 1),
                        Triple("ثبت آگهی", Icons.Default.AddCircle, 2),
                        Triple("نشان‌شده", Icons.Default.FavoriteBorder, 3),
                        Triple("حساب من", Icons.Default.Person, 4)
                    )
                    items.forEach { (label, icon, index) ->
                        NavigationBarItem(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            icon = { Icon(icon, contentDescription = label) },
                            label = { Text(label, fontSize = 10.sp) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Brand,
                                selectedTextColor = Brand,
                                indicatorColor = Brand.copy(alpha = .10f)
                            )
                        )
                    }
                }
            }
        ) { padding ->
            when (selectedTab) {
                0 -> HomeScreen(Modifier.padding(padding))
                1 -> SimpleScreen("دسته‌بندی املاک", "نوع ملک موردنظرتان را انتخاب کنید.")
                2 -> SimpleScreen("ثبت آگهی", "فرم ثبت آگهی در مرحله بعد به سرویس آگهی‌ها متصل می‌شود.")
                3 -> SimpleScreen("نشان‌شده‌ها", "آگهی‌های ذخیره‌شده شما اینجا نمایش داده می‌شوند.")
                else -> SimpleScreen("حساب کاربری", "ورود با شماره موبایل و مدیریت آگهی‌ها.")
            }
        }
    }
}

@Composable
private fun HomeScreen(modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("املاک ۰۵۸", fontSize = 23.sp, fontWeight = FontWeight.Black, color = Brand)
                    Text("بازار آنلاین ملک بجنورد", fontSize = 11.sp, color = Muted)
                }
                Surface(shape = CircleShape, color = Color.White) {
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = "پیام‌ها", tint = Ink)
                    }
                }
                Surface(shape = CircleShape, color = Color.White) {
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.NotificationsNone, contentDescription = "اعلان‌ها", tint = Ink)
                    }
                }
            }
        }
        item {
            OutlinedTextField(
                value = "",
                onValueChange = {},
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("جست‌وجوی خانه، آپارتمان، زمین...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = { Icon(Icons.Default.Tune, contentDescription = "فیلتر") },
                shape = RoundedCornerShape(14.dp),
                singleLine = true,
                readOnly = true
            )
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = Color.White) {
                Column(Modifier.padding(16.dp)) {
                    Text("دنبال چه ملکی هستید؟", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CategoryTile("خرید", Icons.Default.HomeWork, Modifier.weight(1f))
                        CategoryTile("رهن و اجاره", Icons.Default.Key, Modifier.weight(1f))
                        CategoryTile("زمین", Icons.Default.Landscape, Modifier.weight(1f))
                        CategoryTile("تجاری", Icons.Default.Storefront, Modifier.weight(1f))
                    }
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("آگهی‌های تازه", fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("همه آگهی‌ها", color = Brand, fontSize = 12.sp)
            }
        }
        item {
            EmptyListingsCard()
        }
    }
}

@Composable
private fun CategoryTile(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(Color(0xFFFFF3F3), RoundedCornerShape(12.dp))
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(icon, contentDescription = null, tint = Brand, modifier = Modifier.size(25.dp))
        Spacer(Modifier.height(5.dp))
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
    }
}

@Composable
private fun EmptyListingsCard() {
    Surface(shape = RoundedCornerShape(14.dp), color = Color.White) {
        Column(
            Modifier.fillMaxWidth().padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.Default.HomeWork, contentDescription = null, tint = Muted, modifier = Modifier.size(34.dp))
            Spacer(Modifier.height(8.dp))
            Text("آگهی‌های واقعی به‌زودی نمایش داده می‌شوند", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Text("این نسخه هنوز به پایگاه داده متصل نشده است.", color = Muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun SimpleScreen(title: String, message: String) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(title, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        Text(message, color = Muted, textAlign = TextAlign.Center, fontSize = 13.sp)
    }
}
