import 'package:flutter/material.dart';

abstract final class AppSpacing {
  static const x1 = 4.0, x2 = 8.0, x3 = 12.0, x4 = 16.0, x6 = 24.0, x8 = 32.0;
}

abstract final class AppRadius {
  static const sm = 12.0, md = 16.0, lg = 24.0;
}

abstract final class AppColors {
  static const background = Color(0xFF0B0D12);
  static const surface = Color(0xFF141720);
  static const elevated = Color(0xFF1B1F2A);
  static const border = Color(0xFF2A2F3B);
  static const reasonAI = Color(0xFF8E86FF);
  static const highlight = Color(0xFFA49EFF);
  static const text = Color(0xFFF5F6FA);
  static const secondaryText = Color(0xFFA6AAB7);
  static const mutedText = Color(0xFF6D7280);
  static const reasonAISoft = Color(0x2E8E86FF);
}

ThemeData buildTheme() {
  const scheme = ColorScheme.dark(
    primary: AppColors.reasonAI,
    onPrimary: AppColors.background,
    primaryContainer: AppColors.reasonAISoft,
    onPrimaryContainer: AppColors.text,
    secondary: AppColors.highlight,
    onSecondary: AppColors.background,
    secondaryContainer: AppColors.elevated,
    onSecondaryContainer: AppColors.text,
    surface: AppColors.surface,
    onSurface: AppColors.text,
    surfaceContainerLow: AppColors.surface,
    surfaceContainer: AppColors.surface,
    surfaceContainerHigh: AppColors.elevated,
    surfaceContainerHighest: AppColors.elevated,
    outline: AppColors.border,
    outlineVariant: AppColors.border,
    brightness: Brightness.dark,
  );
  final base = ThemeData.dark(useMaterial3: true);
  final text = base.textTheme
      .apply(bodyColor: AppColors.text, displayColor: AppColors.text)
      .copyWith(
        headlineLarge: base.textTheme.headlineLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(height: 1.4),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(height: 1.4),
        bodySmall: base.textTheme.bodySmall?.copyWith(
          color: AppColors.secondaryText,
        ),
        labelSmall: base.textTheme.labelSmall?.copyWith(
          color: AppColors.secondaryText,
        ),
      );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    textTheme: text,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.background,
      foregroundColor: AppColors.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      toolbarHeight: 56,
      titleSpacing: 16,
      titleTextStyle: TextStyle(
        color: AppColors.text,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
      ),
      iconTheme: IconThemeData(color: AppColors.secondaryText, size: 22),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.reasonAISoft,
      height: 68,
      elevation: 0,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 23,
          color: states.contains(WidgetState.selected)
              ? AppColors.reasonAI
              : AppColors.mutedText,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? AppColors.highlight
              : AppColors.mutedText,
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.reasonAI,
        foregroundColor: AppColors.background,
        minimumSize: const Size(0, 44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.secondaryText,
        side: const BorderSide(color: AppColors.border),
        minimumSize: const Size(0, 44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.secondaryText,
        minimumSize: const Size(0, 40),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.elevated,
      selectedColor: AppColors.reasonAISoft,
      disabledColor: AppColors.surface,
      labelStyle: const TextStyle(color: AppColors.secondaryText, fontSize: 12),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: AppColors.highlight,
      unselectedLabelColor: AppColors.secondaryText,
      indicatorColor: AppColors.reasonAI,
      dividerColor: AppColors.border,
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.reasonAI,
      foregroundColor: AppColors.background,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.elevated,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      contentPadding: const EdgeInsets.all(AppSpacing.x4),
    ),
  );
}
